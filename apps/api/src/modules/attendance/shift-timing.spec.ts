import {
  DEFAULT_EARLY_DEPARTURE_GRACE_MINS,
  earlyDeparture,
  isLateArrival,
  isOvernightShift,
  shiftEndFor,
} from './shift-timing';

/** Shift times are wall-clock, so fixtures are built in the server's zone. */
function localAt(day: number, hour: number, minute: number): Date {
  return new Date(2026, 5, day, hour, minute, 0, 0);
}

const dayShift = {
  startTime: '09:00',
  endTime: '18:00',
  gracePeriodMins: 15,
  earlyLeavingGraceMins: 15,
};

const nightShift = {
  startTime: '22:00',
  endTime: '06:00',
  gracePeriodMins: 15,
  earlyLeavingGraceMins: 15,
};

describe('earlyDeparture', () => {
  const punchOutAt = (hour: number, minute: number, shift = dayShift) =>
    earlyDeparture({
      punchIn: localAt(1, 9, 0),
      punchOut: localAt(1, hour, minute),
      shift,
    });

  it('defaults to a 15 minute grace before shift end', () => {
    expect(DEFAULT_EARLY_DEPARTURE_GRACE_MINS).toBe(15);
  });

  // The 18:00 shift boundary cases called out in the fix.
  it('treats 17:45 as a full day for an 18:00 shift', () => {
    expect(punchOutAt(17, 45)).toEqual({ isEarlyDeparture: false, earlyByMinutes: 0 });
  });

  it('treats 17:59 as a full day for an 18:00 shift', () => {
    expect(punchOutAt(17, 59)).toEqual({ isEarlyDeparture: false, earlyByMinutes: 0 });
  });

  it('treats 18:00 as a full day for an 18:00 shift', () => {
    expect(punchOutAt(18, 0)).toEqual({ isEarlyDeparture: false, earlyByMinutes: 0 });
  });

  it('counts 17:44 as one minute early, measured from the 17:45 grace boundary', () => {
    expect(punchOutAt(17, 44)).toEqual({ isEarlyDeparture: true, earlyByMinutes: 1 });
  });

  it('counts a 16:45 punch-out as a full hour early', () => {
    expect(punchOutAt(16, 45)).toEqual({ isEarlyDeparture: true, earlyByMinutes: 60 });
  });

  it('lets the attendance rule override the shift grace', () => {
    const strict = earlyDeparture({
      punchIn: localAt(1, 9, 0),
      punchOut: localAt(1, 17, 45),
      shift: dayShift,
      rule: { earlyLeavingGraceMins: 0 },
    });
    expect(strict).toEqual({ isEarlyDeparture: true, earlyByMinutes: 15 });
  });

  it('falls back to 15 minutes when neither rule nor shift configures a grace', () => {
    const shift = { startTime: '09:00', endTime: '18:00' };
    expect(earlyDeparture({ punchIn: localAt(1, 9, 0), punchOut: localAt(1, 17, 45), shift })).toEqual(
      { isEarlyDeparture: false, earlyByMinutes: 0 },
    );
    expect(earlyDeparture({ punchIn: localAt(1, 9, 0), punchOut: localAt(1, 17, 44), shift })).toEqual(
      { isEarlyDeparture: true, earlyByMinutes: 1 },
    );
  });

  it('never flags a missing punch-out or a missing shift', () => {
    expect(earlyDeparture({ punchOut: null, shift: dayShift }).isEarlyDeparture).toBe(false);
    expect(earlyDeparture({ punchOut: localAt(1, 10, 0), shift: null }).isEarlyDeparture).toBe(false);
  });

  it('measures a day shift punched out after midnight against the day it started', () => {
    // Overtime past midnight used to fall before the *next* day's 17:45
    // boundary and get flagged as a 17 hour early departure.
    const overtime = earlyDeparture({
      punchIn: localAt(1, 9, 0),
      punchOut: localAt(2, 0, 30),
      shift: dayShift,
    });
    expect(overtime).toEqual({ isEarlyDeparture: false, earlyByMinutes: 0 });
  });

  describe('overnight shifts', () => {
    it('recognises a shift that rolls past midnight', () => {
      expect(isOvernightShift(nightShift)).toBe(true);
      expect(isOvernightShift(dayShift)).toBe(false);
    });

    it('ends a 22:00-06:00 shift on the morning after the punch-in', () => {
      expect(shiftEndFor(nightShift, { punchIn: localAt(1, 22, 0) })).toEqual(localAt(2, 6, 0));
    });

    it('treats a 05:45 punch-out as a full night', () => {
      expect(
        earlyDeparture({
          punchIn: localAt(1, 22, 0),
          punchOut: localAt(2, 5, 45),
          shift: nightShift,
        }),
      ).toEqual({ isEarlyDeparture: false, earlyByMinutes: 0 });
    });

    it('flags a 23:30 punch-out on an overnight shift as hours early', () => {
      expect(
        earlyDeparture({
          punchIn: localAt(1, 22, 0),
          punchOut: localAt(1, 23, 30),
          shift: nightShift,
        }),
      ).toEqual({ isEarlyDeparture: true, earlyByMinutes: 375 });
    });

    it('anchors to the punch-out when there is no punch-in', () => {
      expect(
        earlyDeparture({ punchOut: localAt(2, 5, 30), shift: nightShift }),
      ).toEqual({ isEarlyDeparture: true, earlyByMinutes: 15 });
    });
  });
});

describe('isLateArrival', () => {
  it('treats 09:15 as on time and 09:16 as late under a 15 minute grace', () => {
    expect(isLateArrival(localAt(1, 9, 15), dayShift)).toBe(false);
    expect(isLateArrival(localAt(1, 9, 16), dayShift)).toBe(true);
  });

  it('prefers the attendance rule grace over the shift grace', () => {
    expect(isLateArrival(localAt(1, 9, 5), dayShift, { lateMarkAfterMins: 0 })).toBe(true);
  });

  it('is never late without a shift', () => {
    expect(isLateArrival(localAt(1, 23, 0), null)).toBe(false);
  });
});
