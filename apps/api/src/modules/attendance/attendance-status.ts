/**
 * The single place a finished day's length becomes PRESENT / HALF_DAY / ABSENT.
 *
 * The day is scored as a share of the shift it was scheduled against:
 *
 *   ratio      = workingMinutes / scheduled shift minutes
 *   percentage = ratio * 100
 *
 * The previous rule compared presence against `shift span - break` for a full
 * day and half of that for a half day, so three hours of a 09:00-18:00 shift
 * (33%) was ABSENT — an employee who came in and worked a third of the day was
 * recorded as not having attended at all. It also leaned on
 * `breakDurationMins`, which no policy actually maintains: it is a schema
 * default of 60 on every shift, so the marks were really "eight hours" wearing
 * a break's name. Nothing here reads the break.
 *
 * `scheduled` is the gross clock span of the shift, break included, because
 * that is the only span the schedule states reliably. The thresholds are set
 * against that gross span accordingly: 75% of a 09:00-18:00 shift is 6h45m of
 * attendance, which is a full day's work once a typical unpaid break is taken
 * out of it.
 */

import { shiftDurationMinutes } from './shift-timing';

/** At or above this share of the shift, the day is PRESENT. */
export const PRESENT_MIN_ATTENDANCE_PERCENTAGE = 75;
/**
 * At or above this share — but below the PRESENT mark — the day is HALF_DAY.
 * Below it there is no meaningful attendance left to record, and the day is
 * ABSENT: a five minute punch pair must not earn half a day of payroll.
 */
export const HALF_DAY_MIN_ATTENDANCE_PERCENTAGE = 25;
/**
 * Stand-in span for a day no shift resolved for, so a percentage can still be
 * taken. Eight hours, the schedule length the product has always assumed when
 * it has nothing to measure.
 */
export const DEFAULT_SCHEDULED_SHIFT_MINUTES = 480;

/** The statuses a day with both punches can be classified as. */
export type WorkedDayStatus = 'PRESENT' | 'HALF_DAY' | 'ABSENT';

/** Only the schedule is read — never the break, thresholds or grace periods. */
export type ScheduledShift = {
  startTime?: string | null;
  endTime?: string | null;
} | null | undefined;

export interface AttendanceRatio {
  /** Minutes actually worked, floored at zero. */
  workingMinutes: number;
  /** Gross scheduled span of the shift, overnight included. */
  scheduledMinutes: number;
  /** `workingMinutes / scheduledMinutes`. Above 1 for a day worked past the shift. */
  ratio: number;
  /** `ratio * 100`, rounded to two decimals for display only. */
  percentage: number;
  status: WorkedDayStatus;
}

/**
 * Scheduled length of the shift, counting an overnight shift across midnight
 * (22:00-06:00 is 480, not -960), falling back to eight hours when the shift
 * has no usable schedule.
 */
export function scheduledShiftMinutes(shift: ScheduledShift): number {
  return shiftDurationMinutes(shift) ?? DEFAULT_SCHEDULED_SHIFT_MINUTES;
}

/**
 * How much of the assigned shift was attended, and what that makes the day.
 *
 * Boundaries are decided by integer cross-multiplication rather than by the
 * rounded percentage, so a shift length that does not divide evenly cannot let
 * 74.6% round its way into a full day. `percentage` is a reporting value.
 */
export function attendanceRatio(input: {
  workingMinutes: number;
  shift?: ScheduledShift;
}): AttendanceRatio {
  const workingMinutes = Math.max(0, input.workingMinutes);
  const scheduledMinutes = scheduledShiftMinutes(input.shift);
  const ratio = workingMinutes / scheduledMinutes;
  return {
    workingMinutes,
    scheduledMinutes,
    ratio,
    percentage: Math.round(ratio * 100 * 100) / 100,
    status: statusFor(workingMinutes, scheduledMinutes),
  };
}

/** `attendanceRatio(...).status`, for callers that only need the verdict. */
export function workedDayStatus(input: {
  workingMinutes: number;
  shift?: ScheduledShift;
}): WorkedDayStatus {
  return attendanceRatio(input).status;
}

function statusFor(workingMinutes: number, scheduledMinutes: number): WorkedDayStatus {
  const attended = workingMinutes * 100;
  if (attended >= PRESENT_MIN_ATTENDANCE_PERCENTAGE * scheduledMinutes) return 'PRESENT';
  if (attended >= HALF_DAY_MIN_ATTENDANCE_PERCENTAGE * scheduledMinutes) return 'HALF_DAY';
  return 'ABSENT';
}
