/**
 * Folds a day's raw punch events into the values `AttendanceRecord` stores.
 *
 * The daily record stays the rollup every other module reads; this is the only
 * place the rollup is derived, so the interactive punch path, an import and an
 * HR correction can never disagree about what a set of punches means.
 */

import { Prisma } from '@prisma/client';

export type PunchDirectionLike = 'IN' | 'OUT';

export interface PunchEventLike {
  eventAt: Date;
  direction: PunchDirectionLike;
  locationId?: string | null;
  source?: string | null;
  geoLat?: number | null;
  geoLng?: number | null;
  geoAccuracy?: number | null;
}

export interface PunchSegment {
  inAt: Date;
  outAt: Date;
  inLocationId: string | null;
  outLocationId: string | null;
  minutes: number;
}

export interface PunchDaySummary {
  /** First check-in of the day, across every location. */
  firstIn: Date | null;
  /** Last check-out of the day, across every location. */
  lastOut: Date | null;
  firstInLocationId: string | null;
  lastOutLocationId: string | null;
  /** Source of the first check-in — what `AttendanceRecord.punchSource` records. */
  firstInSource: string | null;
  geoLat: number | null;
  geoLng: number | null;
  geoAccuracy: number | null;
  /**
   * `lastOut - firstIn`. The historical meaning of
   * `AttendanceRecord.workingMinutes`, and what status, overtime and payroll
   * are still derived from. `undefined` while the day has no check-out, which
   * is what leaves `workingMinutes` unset mid-day exactly as before.
   */
  grossMinutes: number | undefined;
  /**
   * Sum of the paired segments, so the gaps between a check-out at one location
   * and the next check-in at another are excluded. Equal to `grossMinutes` on a
   * single-segment day.
   */
  netMinutes: number | undefined;
  segments: PunchSegment[];
  /** True when the last event of the day is a check-in — still on the clock. */
  isOpen: boolean;
  punchCount: number;
}

const EMPTY: PunchDaySummary = {
  firstIn: null,
  lastOut: null,
  firstInLocationId: null,
  lastOutLocationId: null,
  firstInSource: null,
  geoLat: null,
  geoLng: null,
  geoAccuracy: null,
  grossMinutes: undefined,
  netMinutes: undefined,
  segments: [],
  isOpen: false,
  punchCount: 0,
};

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
}

/**
 * Pairs events into segments by walking them in time order: a check-in opens a
 * segment, the next check-out closes it. A repeated check-in keeps the earliest
 * open one (the employee never left), and a check-out with nothing open is
 * ignored for pairing but still counts as the day's last check-out — neither
 * can be produced by the punch path, but an import or a correction can, and a
 * malformed pair must not corrupt the totals.
 */
export function summarisePunchEvents(events: PunchEventLike[]): PunchDaySummary {
  if (!events.length) return { ...EMPTY };
  const ordered = [...events].sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime());

  const ins = ordered.filter((event) => event.direction === 'IN');
  const outs = ordered.filter((event) => event.direction === 'OUT');
  const firstInEvent = ins[0] ?? null;
  const lastOutEvent = outs.length ? outs[outs.length - 1] : null;

  const segments: PunchSegment[] = [];
  let open: PunchEventLike | null = null;
  for (const event of ordered) {
    if (event.direction === 'IN') {
      open ??= event;
      continue;
    }
    if (!open) continue;
    segments.push({
      inAt: open.eventAt,
      outAt: event.eventAt,
      inLocationId: open.locationId ?? null,
      outLocationId: event.locationId ?? null,
      minutes: minutesBetween(open.eventAt, event.eventAt),
    });
    open = null;
  }

  const firstIn = firstInEvent?.eventAt ?? null;
  const lastOut = lastOutEvent?.eventAt ?? null;
  // Gross needs both ends, and a check-out that precedes the first check-in
  // (only reachable through a bad import) would otherwise produce a negative
  // day; `minutesBetween` floors it at zero.
  const grossMinutes = firstIn && lastOut ? minutesBetween(firstIn, lastOut) : undefined;

  return {
    firstIn,
    lastOut,
    firstInLocationId: firstInEvent?.locationId ?? null,
    lastOutLocationId: lastOutEvent?.locationId ?? null,
    firstInSource: firstInEvent?.source ?? null,
    geoLat: firstInEvent?.geoLat ?? null,
    geoLng: firstInEvent?.geoLng ?? null,
    geoAccuracy: firstInEvent?.geoAccuracy ?? null,
    grossMinutes,
    netMinutes: segments.length
      ? segments.reduce((sum, segment) => sum + segment.minutes, 0)
      : grossMinutes,
    segments,
    isOpen: ordered[ordered.length - 1].direction === 'IN',
    punchCount: ordered.length,
  };
}

/** The direction the next punch must be, given the day so far. */
export function nextPunchDirection(events: PunchEventLike[]): PunchDirectionLike {
  if (!events.length) return 'IN';
  const ordered = [...events].sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime());
  return ordered[ordered.length - 1].direction === 'IN' ? 'OUT' : 'IN';
}

/** Minimal client surface this module needs, so it works on `prisma` or a `tx`. */
type PunchEventWriter = Pick<Prisma.TransactionClient, 'attendancePunchEvent'>;

export interface SystemPunchEventInput {
  tenantId: string;
  employeeId: string;
  date: Date;
  punchIn?: Date | null;
  punchOut?: Date | null;
  /** Location of the derived check-in. */
  locationId?: string | null;
  /** Location of the derived check-out. Defaults to `locationId`. */
  outLocationId?: string | null;
  shiftId?: string | null;
  source: string;
  deviceId?: string | null;
  remarks?: string | null;
}

/**
 * Rewrites the system-generated punches for one day to match a record written
 * outside the punch path — an import, a regularization, or an HR correction —
 * so the punch history never shows an empty day next to a record that has
 * times.
 *
 * Two rules, in this order:
 *
 * 1. **Existing derived events for the day are always cleared**, whether or not
 *    replacements follow. Passing no punches is therefore how a deleted record
 *    drops the events it produced.
 * 2. **Derived events are only written when the employee did not actually
 *    punch.** They stand in for a day with no punch log; when a real one
 *    exists it already tells the day's story, and laying a synthetic pair on
 *    top would double the day's punch count and misreport an ordinary day as a
 *    multi-punch one in the history report. The employee's own punches are
 *    never touched — a correction changes what the day is *paid* as, and
 *    deleting the punches it corrects would destroy the evidence for it.
 *
 * Shared with the approvals module so an approved regularization writes the
 * same events the direct path does.
 */
export async function syncSystemPunchEvents(
  client: PunchEventWriter,
  input: SystemPunchEventInput,
): Promise<void> {
  await client.attendancePunchEvent.deleteMany({
    where: { employeeId: input.employeeId, attendanceDate: input.date, isSystemGenerated: true },
  });
  const rows = (
    [
      ['IN', input.punchIn, input.locationId],
      ['OUT', input.punchOut, input.outLocationId ?? input.locationId],
    ] as const
  )
    .filter(
      (entry): entry is [PunchDirectionLike, Date, string | null | undefined] =>
        entry[1] instanceof Date,
    )
    .map(([direction, eventAt, locationId]) => ({
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      attendanceDate: input.date,
      eventAt,
      direction,
      locationId: locationId ?? null,
      shiftId: input.shiftId ?? null,
      source: input.source,
      deviceId: input.deviceId ?? null,
      isSystemGenerated: true,
      remarks: input.remarks ?? null,
    }));
  if (!rows.length) return;

  const punched = await client.attendancePunchEvent.count({
    where: { employeeId: input.employeeId, attendanceDate: input.date, isSystemGenerated: false },
  });
  if (punched > 0) return;

  await client.attendancePunchEvent.createMany({ data: rows, skipDuplicates: true });
}
