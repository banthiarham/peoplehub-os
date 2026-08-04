-- Data-only migration: re-scores attendance days the old rule under-recorded.
--
-- Attendance status is now a share of the shift the day was scheduled against
-- (see apps/api/src/modules/attendance/attendance-status.ts):
--
--   ratio = workingMinutes / scheduled shift minutes
--   PRESENT from 75%, HALF_DAY from 25%, ABSENT below that.
--
-- The old rule compared minutes worked against `shift span - breakDurationMins`
-- and half of it, so three hours of a 09:00-18:00 shift was stored as ABSENT.
-- Those rows stay wrong until they are re-scored, and they feed payroll LOP and
-- every attendance report, so they are corrected here.
--
-- Deliberately conservative:
--   * only rows that actually have a worked span (`workingMinutes` not null);
--   * only ABSENT and HALF_DAY rows, and only upgrades — ABSENT -> HALF_DAY /
--     PRESENT and HALF_DAY -> PRESENT. Nothing is ever downgraded, so a day
--     already credited to an employee cannot be taken away by this migration;
--   * ON_LEAVE, HOLIDAY, WEEKEND, LATE, MISSING_PUNCH and PRESENT rows are left
--     exactly as they are;
--   * finalized rows are skipped. A finalized month is closed and its payroll
--     has already been run against these statuses; reopening and re-finalizing
--     it is the operator's decision, not a migration's.
--
-- The thresholds are written out as literals because a migration is a frozen
-- snapshot of the rule at this point in history: if the percentages are ever
-- retuned, that is a new migration, not an edit to this one.
--
-- An upgraded full day is written as PRESENT rather than LATE: deciding
-- lateness needs the punch-in compared against wall-clock shift times, which
-- SQL cannot do without assuming the server's timezone. The monthly ledger
-- derives late arrivals from the stored punches anyway.

WITH scheduled AS (
  SELECT
    a."id",
    a."status" AS "currentStatus",
    GREATEST(a."workingMinutes", 0) AS "workedMinutes",
    -- Gross scheduled span in minutes, counting an overnight shift across
    -- midnight (22:00-06:00 is 480, not -960). The break is not read. A row
    -- with no shift, or a shift whose times are not "HH:MM", falls back to the
    -- same eight hour span the application uses when nothing resolves.
    CASE
      WHEN s."startTime" ~ '^[0-9]{1,2}:[0-9]{2}$' AND s."endTime" ~ '^[0-9]{1,2}:[0-9]{2}$'
      THEN
        CASE
          WHEN (split_part(s."endTime", ':', 1)::int * 60 + split_part(s."endTime", ':', 2)::int)
             > (split_part(s."startTime", ':', 1)::int * 60 + split_part(s."startTime", ':', 2)::int)
          THEN (split_part(s."endTime", ':', 1)::int * 60 + split_part(s."endTime", ':', 2)::int)
             - (split_part(s."startTime", ':', 1)::int * 60 + split_part(s."startTime", ':', 2)::int)
          ELSE (split_part(s."endTime", ':', 1)::int * 60 + split_part(s."endTime", ':', 2)::int) + 1440
             - (split_part(s."startTime", ':', 1)::int * 60 + split_part(s."startTime", ':', 2)::int)
        END
      ELSE 480
    END AS "scheduledMinutes"
  FROM "attendance_records" a
  LEFT JOIN "shifts" s ON s."id" = a."shiftId"
  WHERE a."workingMinutes" IS NOT NULL
    AND a."isFinalized" = false
    AND a."status" IN ('ABSENT', 'HALF_DAY')
),
scored AS (
  SELECT
    "id",
    "currentStatus",
    -- Cross-multiplied rather than divided, so an odd shift length lands on the
    -- same side of the boundary as the application's integer comparison.
    (CASE
      WHEN "workedMinutes" * 100 >= 75 * "scheduledMinutes" THEN 'PRESENT'
      WHEN "workedMinutes" * 100 >= 25 * "scheduledMinutes" THEN 'HALF_DAY'
      ELSE 'ABSENT'
    END)::"AttendanceStatus" AS "newStatus"
  FROM scheduled
)
UPDATE "attendance_records" AS r
SET "status" = scored."newStatus",
    "updatedAt" = NOW()
FROM scored
WHERE r."id" = scored."id"
  AND (
    (scored."currentStatus" = 'ABSENT' AND scored."newStatus" IN ('HALF_DAY', 'PRESENT'))
    OR (scored."currentStatus" = 'HALF_DAY' AND scored."newStatus" = 'PRESENT')
  );
