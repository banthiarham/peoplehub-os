/**
 * Attendance day parsing.
 *
 * Attendance days are stored in `@db.Date` columns and compared everywhere as
 * UTC-midnight anchors (`toISOString().slice(0, 10)`). Imported values must
 * therefore land on the calendar day the uploader typed, never on the day the
 * server's timezone happens to translate it to — `new Date('2026-07-01')` is
 * 2026-06-30 in any negative UTC offset, which silently shifts a whole import.
 *
 * The calendar day is taken from the literal date part of the string, so an
 * offset-bearing timestamp keeps the day its author wrote rather than the day
 * it converts to in UTC.
 */

/** Shown verbatim in row-level import errors and in the import templates. */
export const SUPPORTED_ATTENDANCE_DATE_FORMATS =
  'YYYY-MM-DD or ISO 8601 date-time (e.g. 2026-07-01 or 2026-07-01T00:00:00.000Z)';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ]\d{2}:\d{2}/;

function utcDay(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects overflow dates such as 2026-02-30, which Date.UTC happily rolls over.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Normalizes a supported attendance date value to its UTC-midnight day, or
 * returns `null` when the value is missing, malformed, or ambiguous (for
 * example `01/07/2026`, which could be January or July).
 */
export function parseAttendanceDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : utcDay(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly) {
    return utcDay(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
  }

  const dateTime = ISO_DATE_TIME.exec(trimmed);
  if (dateTime) {
    // The full value still has to be a real instant, so garbage time parts
    // ("2026-07-01T99:99") are rejected instead of silently keeping the day.
    if (Number.isNaN(new Date(trimmed).getTime())) return null;
    return utcDay(Number(dateTime[1]), Number(dateTime[2]), Number(dateTime[3]));
  }

  return null;
}

/** `parseAttendanceDate` with the row-level error message callers report. */
export function parseAttendanceDateOrError(value: unknown): { date: Date } | { error: string } {
  const date = parseAttendanceDate(value);
  if (!date) {
    const shown = typeof value === 'string' && value.trim() ? `"${value.trim()}"` : 'empty value';
    return { error: `Unsupported date ${shown} — use ${SUPPORTED_ATTENDANCE_DATE_FORMATS}` };
  }
  return { date };
}
