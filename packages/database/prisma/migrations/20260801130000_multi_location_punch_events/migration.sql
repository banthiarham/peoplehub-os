-- CreateEnum
CREATE TYPE "PunchDirection" AS ENUM ('IN', 'OUT');

-- AlterTable
-- Sum of paired check-in/check-out segments. Nullable and unread by every
-- existing consumer, which all keep reading `workingMinutes` (the gross span).
ALTER TABLE "attendance_records" ADD COLUMN "netMinutes" INTEGER;

-- CreateTable
CREATE TABLE "employee_locations" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_punch_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "direction" "PunchDirection" NOT NULL,
    "locationId" TEXT,
    "shiftId" TEXT,
    "source" TEXT NOT NULL,
    "geoLat" DOUBLE PRECISION,
    "geoLng" DOUBLE PRECISION,
    "geoAccuracy" DOUBLE PRECISION,
    "deviceId" TEXT,
    "isSystemGenerated" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_punch_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_locations_employeeId_idx" ON "employee_locations"("employeeId");

-- CreateIndex
CREATE INDEX "employee_locations_locationId_idx" ON "employee_locations"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_locations_employeeId_locationId_key" ON "employee_locations"("employeeId", "locationId");

-- CreateIndex
CREATE INDEX "attendance_punch_events_tenantId_attendanceDate_idx" ON "attendance_punch_events"("tenantId", "attendanceDate");

-- CreateIndex
CREATE INDEX "attendance_punch_events_employeeId_attendanceDate_eventAt_idx" ON "attendance_punch_events"("employeeId", "attendanceDate", "eventAt");

-- CreateIndex
CREATE INDEX "attendance_punch_events_locationId_attendanceDate_idx" ON "attendance_punch_events"("locationId", "attendanceDate");

-- CreateIndex
-- Name matches what Prisma generates: the full column list would exceed
-- Postgres' 63 character identifier limit, so `eventAt` is dropped from the
-- name (not the key). Renaming it here would show as drift on every diff.
CREATE UNIQUE INDEX "attendance_punch_events_employeeId_attendanceDate_direction_key" ON "attendance_punch_events"("employeeId", "attendanceDate", "direction", "eventAt");

-- AddForeignKey
ALTER TABLE "employee_locations" ADD CONSTRAINT "employee_locations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_locations" ADD CONSTRAINT "employee_locations_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punch_events" ADD CONSTRAINT "attendance_punch_events_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punch_events" ADD CONSTRAINT "attendance_punch_events_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punch_events" ADD CONSTRAINT "attendance_punch_events_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every employee with a base location gets it as an authorized
-- location, flagged primary. `Employee.locationId` stays the source of truth
-- for the primary; this row only makes the authorized set non-empty in a way
-- that resolves identically to the pre-migration behaviour.
INSERT INTO "employee_locations" ("id", "employeeId", "locationId", "isPrimary", "createdAt")
SELECT
    'emploc_' || "employees"."id",
    "employees"."id",
    "employees"."locationId",
    true,
    CURRENT_TIMESTAMP
FROM "employees"
WHERE "employees"."locationId" IS NOT NULL
ON CONFLICT ("employeeId", "locationId") DO NOTHING;

-- No punch events are reconstructed from historical attendance records, and
-- that is deliberate.
--
-- A record stores only a punch pair; it has never stored where those punches
-- happened. Deriving the location from `employees.locationId` would stamp every
-- historical punch with wherever the employee works *now* — relabelling a year
-- of one office's punches as another's after a transfer — and would ignore any
-- `ShiftAssignment.locationId` that pinned a different location on that date.
-- Invented location data is worse than none in a report whose whole purpose is
-- per-punch location, and it would be indistinguishable from the real thing.
--
-- Punch history therefore starts at deploy. A day with no events simply does
-- not appear in it; the attendance record view continues to show those days
-- exactly as before. Backfilling accurately would mean resolving each day
-- through `ShiftResolutionService`, which belongs in an opt-in script run per
-- tenant, not in a deploy-time migration.

-- Backfill: a single-segment day's net time equals its gross span, so every
-- historical record starts consistent with the new column's definition.
UPDATE "attendance_records"
SET "netMinutes" = "workingMinutes"
WHERE "workingMinutes" IS NOT NULL;
