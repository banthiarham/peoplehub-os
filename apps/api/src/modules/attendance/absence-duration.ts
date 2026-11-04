/**
 * The one rule for "how much of this date was an unpaid absence".
 *
 * Payroll has always needed this to work out LOP; Comp-Off usage validation now needs it too,
 * to refuse a grant whose duration does not match the absence it is being spent against. The
 * two must agree exactly: a usage the API accepts on the strength of a 0.5 contribution, but
 * which payroll later scores as 1, is a grant consumed for less than it was worth, silently.
 * So the arithmetic lives here once and both callers import it, rather than each carrying its
 * own copy.
 *
 * Lifted verbatim from `PayrollService.lopContributionsByDate`, deliberately: this module is a
 * refactor, not a redesign. The two contribution sources, their per-day amounts, the even
 * spread of a leave request across its own span, the clipping to the window, the summing when
 * both land on one date, and the `amount <= 0` skip are all exactly as that method computed
 * them. Any change in what a representative month produces is a bug in this extraction, which
 * is why the payroll suite's existing LOP expectations are the real test of it.
 *
 * Pure and framework-free: it takes rows and returns numbers. It holds no Prisma client and
 * imports nothing from either module it serves, so neither `AttendanceService` nor
 * `PayrollService` gains a dependency on the other and there is no cycle to break.
 */

/** A finalized attendance record that contributes LOP. Only `ABSENT` and `HALF_DAY` ever do. */
export type AbsenceAttendanceRow = {
  employeeId: string;
  date: Date;
  status: string;
};

/**
 * An approved request for a leave type that is not paid. `days` is the request's own total,
 * which is spread evenly across `fromDate..toDate` rather than assumed to be one per day -
 * the same assumption the original `leaveDaysInPeriod` made when prorating a request across a
 * month boundary.
 */
export type UnpaidLeaveRow = {
  employeeId: string;
  days: number;
  fromDate: Date;
  toDate: Date;
};

/** Per-employee, per-ISO-day LOP contribution. Outer key is the employee, inner the day. */
export type AbsenceContributions = Map<string, Map<string, number>>;

/** The ISO day a contribution is keyed on. Matches `PayrollService.dayKey`. */
export function absenceDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Two-decimal rounding for day totals, matching `PayrollService.round2`.
 *
 * Needed wherever fractional days are accumulated: 0.5 + 0.5 is exact, but a leave request
 * spread over three days is not, and an unrounded total reaching a UI column or an equality
 * check would read as 0.9999999999999999.
 */
export function roundDays(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Inclusive day count between two dates. Matches `PayrollService.inclusiveDayCount`. */
function inclusiveDayCount(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

/**
 * What one finalized attendance record contributes: half a day for `HALF_DAY`, a whole day for
 * anything else reaching here.
 *
 * "Anything else" is `ABSENT` in practice, because every caller filters the query to those two
 * statuses before handing rows over. The fallthrough is kept rather than made exhaustive so
 * this function cannot start returning 0 - and so silently drop LOP - if a third status is
 * ever added to that filter without this line being revisited.
 */
export function attendanceAbsenceDays(status: string): number {
  return status === 'HALF_DAY' ? 0.5 : 1;
}

/**
 * Builds the per-employee, per-date LOP contribution map for one window.
 *
 * Both sources are summed where they land on the same date rather than one replacing the
 * other: they are independent facts, and an employee can hold an unpaid leave request over a
 * day attendance also recorded as absent. That is how the pre-existing aggregate
 * (`attendanceLop + lwp`) totalled them, so it is how this totals them.
 *
 * `attendanceTotalByEmployee` is tracked alongside only so a caller can still report "N
 * attendance LOP day(s)" the way it did before this arithmetic was extracted. It counts
 * attendance rows only, never leave, and plays no part in the contribution map.
 */
export function buildAbsenceContributions(input: {
  attendanceRecords: AbsenceAttendanceRow[];
  unpaidLeave: UnpaidLeaveRow[];
  windowStart: Date;
  windowEnd: Date;
}): { byDate: AbsenceContributions; attendanceTotalByEmployee: Map<string, number> } {
  const byDate: AbsenceContributions = new Map();
  const add = (employeeId: string, dayKey: string, amount: number) => {
    if (amount <= 0) return;
    const forEmployee = byDate.get(employeeId) ?? new Map<string, number>();
    forEmployee.set(dayKey, (forEmployee.get(dayKey) ?? 0) + amount);
    byDate.set(employeeId, forEmployee);
  };

  const attendanceTotalByEmployee = new Map<string, number>();
  for (const record of input.attendanceRecords) {
    const amount = attendanceAbsenceDays(record.status);
    add(record.employeeId, absenceDayKey(record.date), amount);
    attendanceTotalByEmployee.set(
      record.employeeId,
      (attendanceTotalByEmployee.get(record.employeeId) ?? 0) + amount,
    );
  }

  for (const leave of input.unpaidLeave) {
    const clippedFrom = leave.fromDate < input.windowStart ? input.windowStart : leave.fromDate;
    const clippedTo = leave.toDate > input.windowEnd ? input.windowEnd : leave.toDate;
    if (clippedTo < clippedFrom) continue;
    // Spread across the request's *own* span, not the clipped one, so a request straddling the
    // window boundary contributes the same per-day amount whichever side is being looked at.
    const totalSpanDays = inclusiveDayCount(leave.fromDate, leave.toDate);
    if (totalSpanDays <= 0) continue;
    const perDay = leave.days / totalSpanDays;
    for (const d = new Date(clippedFrom); d <= clippedTo; d.setUTCDate(d.getUTCDate() + 1)) {
      add(leave.employeeId, absenceDayKey(d), perDay);
    }
  }

  return { byDate, attendanceTotalByEmployee };
}

/**
 * The LOP one date contributed for one employee, or 0 when that date carries none.
 *
 * This is the form Comp-Off usage validation needs: it asks about a single named date, not a
 * whole month. Reading it out of the same map payroll builds is what guarantees the answer
 * agrees, rather than a second query shaped slightly differently.
 */
export function absenceDaysOn(
  contributions: AbsenceContributions,
  employeeId: string,
  date: Date,
): number {
  return contributions.get(employeeId)?.get(absenceDayKey(date)) ?? 0;
}
