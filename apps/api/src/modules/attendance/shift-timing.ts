/**
 * The single place shift boundaries are turned into punch verdicts.
 *
 * Shift `startTime`/`endTime` are wall-clock strings ("09:00"), so boundaries
 * are built in the server's local zone — the same convention the punch path has
 * always used. Locations carry a `timezone`, but no attendance code has ever
 * evaluated punches against it; introducing that here would silently reclassify
 * every historical punch, so the wall-clock convention is kept and documented
 * instead.
 */

/** Applied when neither the attendance rule nor the shift configures one. */
export const DEFAULT_LATE_ARRIVAL_GRACE_MINS = 15;
/** Applied when neither the attendance rule nor the shift configures one. */
export const DEFAULT_EARLY_DEPARTURE_GRACE_MINS = 15;

export interface ShiftTiming {
  startTime: string;
  endTime: string;
  gracePeriodMins?: number | null;
  earlyLeavingGraceMins?: number | null;
}

export interface TimingRule {
  lateMarkAfterMins?: number | null;
  earlyLeavingGraceMins?: number | null;
}

export interface EarlyDeparture {
  /** True only when the punch-out is strictly before the grace boundary. */
  isEarlyDeparture: boolean;
  /**
   * Whole minutes short of the grace boundary, not of the raw shift end: a
   * 18:00 shift with a 15 minute grace treats 17:45 as a full day, so 17:44 is
   * one minute early rather than sixteen.
   */
  earlyByMinutes: number;
}

function timeParts(value: string): { hours: number; minutes: number } {
  const [hours, minutes] = value.split(':').map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

function minutesOfDay(value: string): number {
  const { hours, minutes } = timeParts(value);
  return hours * 60 + minutes;
}

/** A shift whose end is at or before its start rolls over midnight. */
export function isOvernightShift(shift: Pick<ShiftTiming, 'startTime' | 'endTime'>): boolean {
  return minutesOfDay(shift.endTime) <= minutesOfDay(shift.startTime);
}

type ScheduledShift = {
  startTime?: string | null;
  endTime?: string | null;
} | null | undefined;

/**
 * Scheduled length of the shift in minutes, counting an overnight shift across
 * midnight (22:00-06:00 is 480, not -960). `null` when the shift has no usable
 * schedule to measure.
 */
export function shiftDurationMinutes(shift: ScheduledShift): number | null {
  if (!shift?.startTime || !shift?.endTime) return null;
  const start = minutesOfDay(shift.startTime);
  const end = minutesOfDay(shift.endTime);
  const duration = end > start ? end - start : end + 24 * 60 - start;
  return duration > 0 ? duration : null;
}

/**
 * Minutes worked past the end of the resolved shift.
 *
 * Overtime is time on the clock *after the shift ends*, so it is measured
 * straight from the shift end — not from a worked-duration threshold, and with
 * no break deduction. Reuses the same overnight-aware shift end that early
 * departure is measured against, so both sides of the shift agree on when it
 * finished. `undefined` when there is no punch-out or no schedule to measure.
 */
export function overtimeAfterShiftEnd(input: {
  punchIn?: Date | null;
  punchOut?: Date | null;
  shift?: ScheduledShift;
}): number | undefined {
  const { punchOut, shift } = input;
  if (!punchOut || !shift?.startTime || !shift?.endTime) return undefined;
  const end = shiftEndFor({ startTime: shift.startTime, endTime: shift.endTime }, {
    punchIn: input.punchIn,
    punchOut,
  });
  if (!end) return undefined;
  return Math.max(0, Math.floor((punchOut.getTime() - end.getTime()) / 60_000));
}

function atTime(reference: Date, time: string): Date {
  const { hours, minutes } = timeParts(time);
  const stamped = new Date(reference);
  stamped.setHours(hours, minutes, 0, 0);
  return stamped;
}

/**
 * The instant this shift ends for the day the punches belong to.
 *
 * A same-day shift ends on the day it started, so a punch-out after midnight
 * (overtime) is measured against that day's end rather than the next day's. An
 * overnight shift ends at the first occurrence of `endTime` after the punch-in,
 * so a 22:00-06:00 punch-out at 23:30 is correctly six and a half hours early
 * instead of seventeen hours late.
 */
export function shiftEndFor(
  shift: Pick<ShiftTiming, 'startTime' | 'endTime'>,
  punches: { punchIn?: Date | null; punchOut?: Date | null },
): Date | null {
  const anchor = punches.punchIn ?? punches.punchOut;
  if (!anchor) return null;
  const end = atTime(anchor, shift.endTime);
  if (!isOvernightShift(shift)) return end;
  if (punches.punchIn) {
    // First `endTime` strictly after the punch-in.
    if (end <= punches.punchIn) end.setDate(end.getDate() + 1);
    return end;
  }
  // Punch-out only: it belongs to the end side of the shift, so the nearest
  // `endTime` at or after it is the boundary.
  if (end < anchor) end.setDate(end.getDate() + 1);
  return end;
}

export function lateArrivalGraceMins(
  shift?: Pick<ShiftTiming, 'gracePeriodMins'> | null,
  rule?: Pick<TimingRule, 'lateMarkAfterMins'> | null,
): number {
  return rule?.lateMarkAfterMins ?? shift?.gracePeriodMins ?? DEFAULT_LATE_ARRIVAL_GRACE_MINS;
}

export function earlyDepartureGraceMins(
  shift?: Pick<ShiftTiming, 'earlyLeavingGraceMins'> | null,
  rule?: Pick<TimingRule, 'earlyLeavingGraceMins'> | null,
): number {
  return (
    rule?.earlyLeavingGraceMins ??
    shift?.earlyLeavingGraceMins ??
    DEFAULT_EARLY_DEPARTURE_GRACE_MINS
  );
}

/** Shared by the interactive punch path and the read-only monthly ledger. */
export function isLateArrival(
  punchIn: Date,
  shift?: Partial<Pick<ShiftTiming, 'startTime' | 'gracePeriodMins'>> | null,
  rule?: Pick<TimingRule, 'lateMarkAfterMins'> | null,
): boolean {
  // No schedule, nothing to be late for — matching the other helpers here,
  // which all treat a shift without times as unmeasurable rather than crashing.
  if (!shift?.startTime) return false;
  const { hours, minutes } = timeParts(shift.startTime);
  const boundary = new Date(punchIn);
  boundary.setHours(hours, minutes + lateArrivalGraceMins(shift, rule), 0, 0);
  return punchIn > boundary;
}

const NO_EARLY_DEPARTURE: EarlyDeparture = { isEarlyDeparture: false, earlyByMinutes: 0 };

/**
 * Early departure against the shift end minus its grace period. Punching out at
 * or after the boundary is a full day; before it, the shortfall is counted from
 * the boundary.
 */
export function earlyDeparture(input: {
  punchOut?: Date | null;
  punchIn?: Date | null;
  shift?: ShiftTiming | null;
  rule?: Pick<TimingRule, 'earlyLeavingGraceMins'> | null;
}): EarlyDeparture {
  const { punchOut, shift } = input;
  if (!punchOut || !shift) return NO_EARLY_DEPARTURE;
  const end = shiftEndFor(shift, { punchIn: input.punchIn, punchOut });
  if (!end) return NO_EARLY_DEPARTURE;
  const boundary = new Date(end.getTime() - earlyDepartureGraceMins(shift, input.rule) * 60_000);
  if (punchOut >= boundary) return NO_EARLY_DEPARTURE;
  return {
    isEarlyDeparture: true,
    earlyByMinutes: Math.ceil((boundary.getTime() - punchOut.getTime()) / 60_000),
  };
}
