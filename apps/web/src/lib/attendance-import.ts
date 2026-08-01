/**
 * Attendance import parsing and payload shaping.
 *
 * `status` is deliberately optional end to end. A CSV without a status column,
 * or with a blank status cell, must reach the API with no `status` field at all
 * so the backend derives PRESENT / LATE / HALF_DAY / ABSENT / MISSING_PUNCH from
 * the punches, shift and attendance rule. Defaulting it to PRESENT here made
 * every imported row PRESENT regardless of how long the day actually was.
 */

/** Kept in sync with SUPPORTED_ATTENDANCE_DATE_FORMATS in the API. */
export const SUPPORTED_DATE_FORMATS_HELP =
  'Supported date formats: YYYY-MM-DD (2026-07-15) or ISO 8601 date-time (2026-07-15T00:00:00.000Z).';

export interface AttendanceImportRow {
  id: string;
  employeeCode: string;
  date: string;
  punchIn: string;
  punchOut: string;
  /** Empty means "derive on the server". Never defaulted to a concrete status. */
  status: string;
  /** Set when the uploaded date cell could not be normalized. */
  dateError?: string;
}

/** Statuses an importer may pin explicitly, overriding derivation. */
export const ATTENDANCE_STATUS_OPTIONS = [
  'PRESENT',
  'LATE',
  'HALF_DAY',
  'ABSENT',
  'MISSING_PUNCH',
  'ON_LEAVE',
];

export const ATTENDANCE_IMPORT_TEMPLATE = [
  '# date accepts YYYY-MM-DD or an ISO 8601 date-time, e.g. 2026-07-15 or 2026-07-15T00:00:00.000Z',
  '# status is optional — leave it blank to have it derived from the punches and shift',
  'employeeCode,date,punchIn,punchOut,status',
  'VH-1001,2026-07-15,09:00,18:30,',
  'VH-1002,2026-07-15T00:00:00.000Z,09:10,18:00,',
  'VH-1003,2026-07-15,09:00,18:00,ON_LEAVE',
  '',
].join('\n');

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[T ]\d{2}:\d{2}/;

/**
 * Normalizes an imported date cell to YYYY-MM-DD without letting the browser
 * timezone move the day. The calendar day is read from the literal date part,
 * so `2026-07-01T00:00:00.000Z` stays July 1st everywhere.
 */
export function normalizeImportDate(value: string): { date: string } | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { error: `Date is required. ${SUPPORTED_DATE_FORMATS_HELP}` };
  const match = DATE_ONLY_PATTERN.exec(trimmed) ?? ISO_DATE_TIME_PATTERN.exec(trimmed);
  if (match) {
    const [, year, month, day] = match;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    const roundTrips =
      parsed.getUTCFullYear() === Number(year) &&
      parsed.getUTCMonth() === Number(month) - 1 &&
      parsed.getUTCDate() === Number(day);
    if (roundTrips) return { date: `${year}-${month}-${day}` };
  }
  return { error: `Unsupported date "${trimmed}". ${SUPPORTED_DATE_FORMATS_HELP}` };
}

export function combineDateTime(date: string, time: string): string | undefined {
  if (!date || !time) return undefined;
  return new Date(`${date}T${time}:00`).toISOString();
}

export function normalizeImportDateTime(date: string, value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes('T')) return new Date(trimmed).toISOString();
  return combineDateTime(date, trimmed);
}

export function newAttendanceImportRow(): AttendanceImportRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    employeeCode: '',
    date: new Date().toISOString().slice(0, 10),
    punchIn: '09:00',
    punchOut: '18:00',
    // Derived by default. Pinning PRESENT here is what made every added row
    // present no matter what the punches said.
    status: '',
  };
}

export function parseAttendanceCsv(text: string): AttendanceImportRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines[0]?.toLowerCase();
  const dataLines = header?.includes('employeecode') ? lines.slice(1) : lines;
  return dataLines
    .filter((line) => !line.startsWith('#'))
    .map((line, index) => {
      // No default on `status`: an absent column and a blank cell both mean
      // "derive", and must stay distinguishable from an explicit choice.
      const [employeeCode = '', date = '', punchIn = '', punchOut = '', status = ''] = line
        .split(',')
        .map((cell) => cell.trim());
      const normalized = normalizeImportDate(date);
      return {
        id: `${Date.now()}-${index}`,
        employeeCode,
        date: 'date' in normalized ? normalized.date : '',
        punchIn,
        punchOut,
        status: status.toUpperCase(),
        ...('error' in normalized && date ? { dateError: normalized.error } : {}),
      };
    });
}

/** The rows the API accepts: `status` is omitted entirely unless pinned. */
export function toAttendanceImportPayload(rows: AttendanceImportRow[]) {
  return rows
    .filter((row) => row.employeeCode.trim() && row.date)
    .map((row) => ({
      employeeCode: row.employeeCode.trim(),
      date: row.date,
      punchIn: normalizeImportDateTime(row.date, row.punchIn),
      punchOut: normalizeImportDateTime(row.date, row.punchOut),
      ...(row.status ? { status: row.status } : {}),
    }));
}
