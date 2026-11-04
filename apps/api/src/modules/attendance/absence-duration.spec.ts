import {
  absenceDaysOn,
  attendanceAbsenceDays,
  buildAbsenceContributions,
} from './absence-duration';

/**
 * The extracted absence-duration rule.
 *
 * What these tests are really protecting is an *equality*: payroll's LOP and Comp-Off usage
 * validation must score the same date identically. The cases below therefore pin the exact
 * amounts the original `lopContributionsByDate` produced - half a day for HALF_DAY, a whole
 * day for ABSENT, a leave request spread evenly across its own span, both sources summed on a
 * shared date - rather than merely asserting "something was counted".
 */

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const WINDOW_START = day('2026-11-01');
const WINDOW_END = day('2026-11-30');

function build(
  attendanceRecords: Array<{ employeeId: string; date: Date; status: string }> = [],
  unpaidLeave: Array<{ employeeId: string; days: number; fromDate: Date; toDate: Date }> = [],
  windowStart = WINDOW_START,
  windowEnd = WINDOW_END,
) {
  return buildAbsenceContributions({ attendanceRecords, unpaidLeave, windowStart, windowEnd });
}

describe('attendanceAbsenceDays', () => {
  it('scores a HALF_DAY as half a day', () => {
    expect(attendanceAbsenceDays('HALF_DAY')).toBe(0.5);
  });

  it('scores an ABSENT as a whole day', () => {
    expect(attendanceAbsenceDays('ABSENT')).toBe(1);
  });
});

describe('buildAbsenceContributions', () => {
  it('resolves a finalized full-day absence to 1', () => {
    const { byDate } = build([{ employeeId: 'e1', date: day('2026-11-10'), status: 'ABSENT' }]);
    expect(absenceDaysOn(byDate, 'e1', day('2026-11-10'))).toBe(1);
  });

  it('resolves a finalized half-day absence to 0.5', () => {
    const { byDate } = build([{ employeeId: 'e1', date: day('2026-11-10'), status: 'HALF_DAY' }]);
    expect(absenceDaysOn(byDate, 'e1', day('2026-11-10'))).toBe(0.5);
  });

  it('reports 0 for a date with no contribution at all', () => {
    const { byDate } = build([{ employeeId: 'e1', date: day('2026-11-10'), status: 'ABSENT' }]);
    expect(absenceDaysOn(byDate, 'e1', day('2026-11-11'))).toBe(0);
  });

  it('reports 0 for an employee with no contributions at all', () => {
    const { byDate } = build([{ employeeId: 'e1', date: day('2026-11-10'), status: 'ABSENT' }]);
    expect(absenceDaysOn(byDate, 'e2', day('2026-11-10'))).toBe(0);
  });

  it('keeps one employee’s absences out of another’s', () => {
    const { byDate } = build([
      { employeeId: 'e1', date: day('2026-11-10'), status: 'ABSENT' },
      { employeeId: 'e2', date: day('2026-11-10'), status: 'HALF_DAY' },
    ]);
    expect(absenceDaysOn(byDate, 'e1', day('2026-11-10'))).toBe(1);
    expect(absenceDaysOn(byDate, 'e2', day('2026-11-10'))).toBe(0.5);
  });

  it('spreads an unpaid leave request evenly across its own span', () => {
    // 4 days over a 4-day span: one per day, every day of the span.
    const { byDate } = build([], [
      { employeeId: 'e1', days: 4, fromDate: day('2026-11-05'), toDate: day('2026-11-08') },
    ]);
    for (const d of ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']) {
      expect(absenceDaysOn(byDate, 'e1', day(d))).toBe(1);
    }
    expect(absenceDaysOn(byDate, 'e1', day('2026-11-09'))).toBe(0);
  });

  it('spreads a half-day leave request as a fraction, not a whole day', () => {
    const { byDate } = build([], [
      { employeeId: 'e1', days: 1, fromDate: day('2026-11-05'), toDate: day('2026-11-06') },
    ]);
    expect(absenceDaysOn(byDate, 'e1', day('2026-11-05'))).toBe(0.5);
    expect(absenceDaysOn(byDate, 'e1', day('2026-11-06'))).toBe(0.5);
  });

  it('clips a leave request to the window but keeps its per-day rate from the full span', () => {
    // 10 days over 1 Nov..10 Nov is 1/day. Looking only at 1 Nov..3 Nov must still read 1/day,
    // not 10/3 - the rate comes from the request's own span.
    const { byDate } = build(
      [],
      [{ employeeId: 'e1', days: 10, fromDate: day('2026-11-01'), toDate: day('2026-11-10') }],
      day('2026-11-01'),
      day('2026-11-03'),
    );
    expect(absenceDaysOn(byDate, 'e1', day('2026-11-01'))).toBe(1);
    expect(absenceDaysOn(byDate, 'e1', day('2026-11-03'))).toBe(1);
    expect(absenceDaysOn(byDate, 'e1', day('2026-11-04'))).toBe(0);
  });

  it('ignores a leave request lying entirely outside the window', () => {
    const { byDate } = build([], [
      { employeeId: 'e1', days: 2, fromDate: day('2026-12-05'), toDate: day('2026-12-06') },
    ]);
    expect(byDate.size).toBe(0);
  });

  it('sums attendance and unpaid leave landing on the same date', () => {
    // Independent sources: the half day and the leave day both count, as the pre-existing
    // `attendanceLop + lwp` aggregate did. This is the case exact-duration matching must not
    // be fooled by - the date is worth 1.5, which no single grant can match.
    const { byDate } = build(
      [{ employeeId: 'e1', date: day('2026-11-10'), status: 'HALF_DAY' }],
      [{ employeeId: 'e1', days: 1, fromDate: day('2026-11-10'), toDate: day('2026-11-10') }],
    );
    expect(absenceDaysOn(byDate, 'e1', day('2026-11-10'))).toBe(1.5);
  });

  it('sums two overlapping unpaid leave requests on one date', () => {
    const { byDate } = build([], [
      { employeeId: 'e1', days: 1, fromDate: day('2026-11-10'), toDate: day('2026-11-10') },
      { employeeId: 'e1', days: 1, fromDate: day('2026-11-10'), toDate: day('2026-11-11') },
    ]);
    expect(absenceDaysOn(byDate, 'e1', day('2026-11-10'))).toBe(1.5);
  });

  it('skips a zero-day leave request rather than writing a 0 entry', () => {
    const { byDate } = build([], [
      { employeeId: 'e1', days: 0, fromDate: day('2026-11-05'), toDate: day('2026-11-06') },
    ]);
    expect(byDate.size).toBe(0);
  });

  it('skips an inverted leave span instead of looping forever', () => {
    const { byDate } = build([], [
      { employeeId: 'e1', days: 2, fromDate: day('2026-11-10'), toDate: day('2026-11-05') },
    ]);
    expect(byDate.size).toBe(0);
  });

  it('totals attendance LOP per employee without counting leave', () => {
    const { attendanceTotalByEmployee } = build(
      [
        { employeeId: 'e1', date: day('2026-11-10'), status: 'ABSENT' },
        { employeeId: 'e1', date: day('2026-11-11'), status: 'HALF_DAY' },
      ],
      [{ employeeId: 'e1', days: 3, fromDate: day('2026-11-20'), toDate: day('2026-11-22') }],
    );
    expect(attendanceTotalByEmployee.get('e1')).toBe(1.5);
  });

  it('builds nothing at all from empty input', () => {
    const { byDate, attendanceTotalByEmployee } = build();
    expect(byDate.size).toBe(0);
    expect(attendanceTotalByEmployee.size).toBe(0);
  });
});
