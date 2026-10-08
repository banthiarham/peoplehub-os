/**
 * Shapes an attendance ledger into the two reviewable attendance reports.
 *
 * Nothing here queries, classifies or decides anything: it receives days that
 * {@link AttendanceService.rangeLedger} has already classified and turns them
 * into labelled, ordered columns. Keeping the shaping pure is what lets the
 * column set, the orderings and every formatting rule be tested without a
 * database.
 *
 * ## The two reports
 * - **Monthly Register** — one row per employee per calendar day, including the
 *   absent, on-leave, weekly-off and holiday days a raw record dump omits.
 * - **Employee Summary** — one row per employee *per month*, totalled from the
 *   same days. Per month rather than per range, because a two-month export has
 *   to reconcile month by month; a single figure spanning two months with
 *   different working-day counts reconciles to nothing.
 *
 * ## Deliberately absent
 * No LOP days, denominator days, payable days, comp-off offsets or paid/unpaid
 * leave split. Those are payroll policy, not attendance fact — they depend on
 * decisions (which leave types are unpaid, which denominator applies, whether a
 * weekly off inside an absence spell is payable) that this phase does not make.
 * `Unfinalized Days` is reported instead: it is a plain fact about the records,
 * and it is exactly the gap between what this shows and what payroll — which
 * counts finalized records only — would pay.
 *
 * ## Times
 * Punch times render as local-zone `HH:MM`, the same wall-clock convention
 * `shift-timing.ts` evaluates punches in. Rendering them in any other zone
 * would print an arrival that disagrees with the late mark sitting next to it.
 */

import type { AttendanceStatus } from '@prisma/client';
import type { RangeLedgerDay } from '../attendance/attendance.service';

/** Employee identity the reports repeat on every row. */
export type ReportEmployee = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  departmentName?: string | null;
  locationName?: string | null;
  joiningDate?: Date | null;
  exitDate?: Date | null;
};

/** A column: the object key, its header label, and how a sheet should size it. */
export type ColumnSpec = {
  key: string;
  label: string;
  width: number;
  /** Right-aligned in a sheet, and left unquoted as a number in CSV. */
  numeric?: boolean;
};

export type ReportRow = Record<string, string | number | null>;

/** Statuses the ledger can report, in the order the summary counts them. */
const STATUS_LABELS: Record<AttendanceStatus | string, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  HALF_DAY: 'Half Day',
  ABSENT: 'Absent',
  ON_LEAVE: 'On Leave',
  WEEKEND: 'Weekly Off',
  HOLIDAY: 'Holiday',
  MISSING_PUNCH: 'Missing Punch',
  EARLY_LEAVING: 'Early Leaving',
  WORK_FROM_HOME: 'Work From Home',
  ON_DUTY: 'On Duty',
};

/** Capture-mode codes as stored on the record, in reviewer-facing words. */
const SOURCE_LABELS: Record<string, string> = {
  WEB: 'Web',
  MOBILE: 'Mobile',
  GPS: 'GPS',
  QR: 'QR',
  BIOMETRIC: 'Biometric',
  MANUAL: 'Manual',
  API: 'API Import',
  API_IMPORT: 'API Import',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Statuses that are not an attendable working day. */
const NON_WORKING_STATUSES = new Set<string>(['WEEKEND', 'HOLIDAY']);

/**
 * Statuses for which having no attendance record is the normal case, so saying
 * so in Remarks would be noise. A day off has nothing to record, and an
 * approved leave day already names its own leave type.
 */
const RECORDLESS_BY_NATURE = new Set<string>(['WEEKEND', 'HOLIDAY', 'ON_LEAVE']);

export function statusLabel(status: AttendanceStatus | string): string {
  return STATUS_LABELS[status] ?? titleCase(status);
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function sourceLabel(source: string | null): string {
  if (!source) return '';
  return SOURCE_LABELS[source] ?? titleCase(source);
}

/** `YYYY-MM-DD` from a UTC-anchored day, the anchor attendance dates use. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `Sep 2026` — the grouping label, readable without parsing a date. */
export function monthLabel(date: Date): string {
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** `2026-09`, sortable, used to group days into summary rows. */
export function monthSortKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dayName(date: Date): string {
  return DAY_NAMES[date.getUTCDay()];
}

/**
 * A punch instant as local-zone `HH:MM`.
 *
 * Local rather than UTC, and rather than any configured zone, because
 * `shift-timing.ts` builds every shift boundary in the server's local zone — so
 * this is the only rendering under which a printed arrival and the late mark
 * beside it describe the same moment.
 */
export function clockTime(at: Date | null): string {
  if (!at) return '';
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/** Minutes as `HH:MM` duration — `498` reads as `08:18`, not as 498. */
export function durationHhMm(minutes: number | null): string {
  if (minutes == null) return '';
  const whole = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

/** Minutes as decimal hours, for anyone summing or charting the column. */
export function durationHours(minutes: number | null): number | null {
  if (minutes == null) return null;
  return Math.round((Math.max(0, minutes) / 60) * 100) / 100;
}

function employeeName(employee: ReportEmployee): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

/** A full day's shift window, e.g. `09:00-18:00`. */
function shiftTiming(day: RangeLedgerDay): string {
  if (!day.shiftStartTime || !day.shiftEndTime) return '';
  return `${day.shiftStartTime}-${day.shiftEndTime}`;
}

/**
 * Short notes a reviewer would otherwise have to infer by comparing columns:
 * a punch pair with one side missing, and a day whose status was derived rather
 * than recorded. The record's own `remarks` come first when it has any.
 */
function registerRemarks(day: RangeLedgerDay): string {
  const notes: string[] = [];
  if (day.remarks) notes.push(day.remarks);
  if (day.punchIn && !day.punchOut) notes.push('Missing punch out');
  if (!day.punchIn && day.punchOut) notes.push('Missing punch in');
  if (day.source === 'DERIVED' && !RECORDLESS_BY_NATURE.has(day.status)) {
    notes.push('No attendance record');
  }
  return notes.join('; ');
}

export const REGISTER_COLUMNS: ColumnSpec[] = [
  { key: 'month', label: 'Month', width: 10 },
  { key: 'date', label: 'Date', width: 12 },
  { key: 'day', label: 'Day', width: 6 },
  { key: 'employeeCode', label: 'Employee Code', width: 16 },
  { key: 'employeeName', label: 'Employee Name', width: 24 },
  { key: 'department', label: 'Department', width: 18 },
  { key: 'location', label: 'Location', width: 18 },
  { key: 'shift', label: 'Shift', width: 14 },
  { key: 'shiftTiming', label: 'Shift Timing', width: 14 },
  { key: 'status', label: 'Status', width: 14 },
  { key: 'checkIn', label: 'Check In', width: 10 },
  { key: 'checkOut', label: 'Check Out', width: 10 },
  { key: 'workedHours', label: 'Worked Hours', width: 13 },
  { key: 'workedHoursDecimal', label: 'Worked Hours (Dec)', width: 18, numeric: true },
  { key: 'lateByMinutes', label: 'Late By (min)', width: 13, numeric: true },
  { key: 'earlyOutByMinutes', label: 'Early Out By (min)', width: 18, numeric: true },
  { key: 'overtimeHours', label: 'Overtime (hrs)', width: 14, numeric: true },
  { key: 'leaveType', label: 'Leave Type', width: 18 },
  { key: 'source', label: 'Source', width: 12 },
  { key: 'finalized', label: 'Finalized', width: 10 },
  { key: 'remarks', label: 'Remarks', width: 28 },
];

export const SUMMARY_COLUMNS: ColumnSpec[] = [
  { key: 'month', label: 'Month', width: 10 },
  { key: 'employeeCode', label: 'Employee Code', width: 16 },
  { key: 'employeeName', label: 'Employee Name', width: 24 },
  { key: 'department', label: 'Department', width: 18 },
  { key: 'location', label: 'Location', width: 18 },
  { key: 'joiningDate', label: 'Date of Joining', width: 16 },
  { key: 'relievingDate', label: 'Date of Relieving', width: 18 },
  { key: 'calendarDays', label: 'Calendar Days', width: 14, numeric: true },
  { key: 'expectedWorkingDays', label: 'Expected Working Days', width: 21, numeric: true },
  { key: 'present', label: 'Present', width: 9, numeric: true },
  { key: 'late', label: 'Late', width: 7, numeric: true },
  { key: 'halfDay', label: 'Half Day', width: 10, numeric: true },
  { key: 'absent', label: 'Absent', width: 9, numeric: true },
  { key: 'onLeave', label: 'On Leave', width: 10, numeric: true },
  { key: 'weeklyOff', label: 'Weekly Off', width: 12, numeric: true },
  { key: 'holiday', label: 'Holiday', width: 9, numeric: true },
  { key: 'missingPunch', label: 'Missing Punch', width: 14, numeric: true },
  { key: 'workedHours', label: 'Worked Hours', width: 13 },
  { key: 'avgHoursPerDay', label: 'Avg Hours/Day', width: 14, numeric: true },
  { key: 'overtimeHours', label: 'Overtime Hours', width: 15, numeric: true },
  { key: 'attendancePercentage', label: 'Attendance %', width: 13, numeric: true },
  { key: 'finalizedDays', label: 'Finalized Days', width: 15, numeric: true },
  { key: 'unfinalizedDays', label: 'Unfinalized Days', width: 17, numeric: true },
];

/**
 * Register rows for one tenant-wide ledger.
 *
 * Ordered employee-major (by employee code), then date ascending, so each
 * person's whole range reads as one contiguous block with months in order. The
 * previous export's date-descending order interleaved everybody, which is what
 * made an employee's own month impossible to follow.
 *
 * Identity is repeated on every row and no blank separator or subtotal rows are
 * emitted: those are what break a spreadsheet's AutoFilter and pivot tables.
 * Totals belong to the summary report.
 */
export function buildRegisterRows(
  employees: ReportEmployee[],
  ledger: Map<string, RangeLedgerDay[]>,
  options: { includeNonWorkingDays?: boolean } = {},
): ReportRow[] {
  const includeNonWorking = options.includeNonWorkingDays ?? true;
  const rows: ReportRow[] = [];
  for (const employee of sortedEmployees(employees)) {
    const days = [...(ledger.get(employee.id) ?? [])].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    for (const day of days) {
      if (!includeNonWorking && NON_WORKING_STATUSES.has(day.status)) continue;
      rows.push({
        month: monthLabel(day.date),
        date: isoDay(day.date),
        day: dayName(day.date),
        employeeCode: employee.employeeCode,
        employeeName: employeeName(employee),
        department: employee.departmentName ?? '',
        location: employee.locationName ?? '',
        shift: day.shiftName ?? '',
        shiftTiming: shiftTiming(day),
        status: statusLabel(day.status),
        checkIn: clockTime(day.punchIn),
        checkOut: clockTime(day.punchOut),
        workedHours: durationHhMm(day.workingMinutes),
        workedHoursDecimal: durationHours(day.workingMinutes),
        lateByMinutes: day.lateByMinutes || null,
        earlyOutByMinutes: day.earlyDepartureMinutes || null,
        overtimeHours: durationHours(day.overtimeMinutes),
        leaveType: day.leaveType ?? '',
        source: sourceLabel(day.punchSource),
        finalized: day.source === 'RECORD' ? (day.isFinalized ? 'Yes' : 'No') : '',
        remarks: registerRemarks(day),
      });
    }
  }
  return rows;
}

/**
 * Summary rows: one per employee per month present in the ledger.
 *
 * `Attendance %` reuses the ledger's existing definition —
 * `(present + late + half day x 0.5) / attendable days`, with approved leave
 * excluded from the denominator so it neither rewards nor penalises — rather
 * than introducing a second formula for the same number.
 */
export function buildSummaryRows(
  employees: ReportEmployee[],
  ledger: Map<string, RangeLedgerDay[]>,
): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const employee of sortedEmployees(employees)) {
    const byMonth = new Map<string, RangeLedgerDay[]>();
    for (const day of ledger.get(employee.id) ?? []) {
      const key = monthSortKey(day.date);
      const bucket = byMonth.get(key);
      if (bucket) bucket.push(day);
      else byMonth.set(key, [day]);
    }
    for (const key of [...byMonth.keys()].sort()) {
      const days = byMonth.get(key) ?? [];
      rows.push(summaryRow(employee, days));
    }
  }
  return rows;
}

function summaryRow(employee: ReportEmployee, days: RangeLedgerDay[]): ReportRow {
  const count = (status: AttendanceStatus | string) =>
    days.filter((day) => day.status === status).length;
  const present = count('PRESENT');
  const late = count('LATE');
  const halfDay = count('HALF_DAY');
  const onLeave = count('ON_LEAVE');
  const holiday = count('HOLIDAY');
  const weeklyOff = count('WEEKEND');
  const expectedWorkingDays = days.length - holiday - weeklyOff;
  const attendableDays = expectedWorkingDays - onLeave;
  const worked = days.filter((day) => day.workingMinutes != null);
  const totalWorkingMinutes = worked.reduce((sum, day) => sum + (day.workingMinutes ?? 0), 0);
  const totalOvertimeMinutes = days.reduce((sum, day) => sum + (day.overtimeMinutes ?? 0), 0);
  const recorded = days.filter((day) => day.source === 'RECORD');
  const anchor = days[0]?.date;

  return {
    month: anchor ? monthLabel(anchor) : '',
    employeeCode: employee.employeeCode,
    employeeName: employeeName(employee),
    department: employee.departmentName ?? '',
    location: employee.locationName ?? '',
    joiningDate: employee.joiningDate ? isoDay(employee.joiningDate) : '',
    relievingDate: employee.exitDate ? isoDay(employee.exitDate) : '',
    calendarDays: days.length,
    expectedWorkingDays,
    present,
    late,
    halfDay,
    absent: count('ABSENT'),
    onLeave,
    weeklyOff,
    holiday,
    missingPunch: count('MISSING_PUNCH'),
    workedHours: durationHhMm(totalWorkingMinutes),
    avgHoursPerDay: worked.length ? durationHours(totalWorkingMinutes / worked.length) : null,
    overtimeHours: durationHours(totalOvertimeMinutes),
    attendancePercentage:
      attendableDays > 0
        ? Math.round(((present + late + halfDay * 0.5) / attendableDays) * 1000) / 10
        : null,
    finalizedDays: recorded.filter((day) => day.isFinalized).length,
    unfinalizedDays: recorded.filter((day) => !day.isFinalized).length,
  };
}

/** Employee-code order, so both reports group the same way. */
function sortedEmployees(employees: ReportEmployee[]): ReportEmployee[] {
  return [...employees].sort((a, b) =>
    a.employeeCode.localeCompare(b.employeeCode, undefined, { numeric: true }),
  );
}

/**
 * Register rows split into one group per month, for a workbook that gives each
 * month its own sheet. A single-month range yields one group, so the caller can
 * treat both cases alike.
 *
 * Grouped on the `YYYY-MM` prefix of the date rather than on the display label,
 * so the sheets come out chronologically whatever order the rows arrive in —
 * rows are employee-major, so an employee who joined mid-range would otherwise
 * put their later first month ahead of an earlier one.
 */
export function groupRowsByMonth(rows: ReportRow[]): Array<{ label: string; rows: ReportRow[] }> {
  const groups = new Map<string, { label: string; rows: ReportRow[] }>();
  for (const row of rows) {
    const key = String(row.date ?? '').slice(0, 7);
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { label: String(row.month ?? key), rows: [row] });
  }
  return [...groups.keys()].sort().map((key) => groups.get(key)!);
}
