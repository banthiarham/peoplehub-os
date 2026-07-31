import {
  DEFAULT_EARLY_DEPARTURE_GRACE_MINS,
  earlyDeparture,
  isLateArrival,
  isOvernightShift,
  overtimeAfterShiftEnd,
  shiftDurationMinutes,
  shiftEndFor,
  workingDayThresholds,
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

describe('shiftDurationMinutes', () => {
  it('measures a same-day shift', () => {
    expect(shiftDurationMinutes(dayShift)).toBe(540);
  });

  it('measures an overnight shift across midnight', () => {
    expect(shiftDurationMinutes(nightShift)).toBe(480);
  });

  it('has no duration without a schedule', () => {
    expect(shiftDurationMinutes(null)).toBeNull();
    expect(shiftDurationMinutes({ startTime: '09:00', endTime: null })).toBeNull();
  });
});

describe('workingDayThresholds', () => {
  // `minWorking = span - break`, `halfDay = floor(minWorking / 2)`. `dayShift`
  // and `nightShift` configure no break, so their span is the full day; every
  // case that expects a smaller mark states its break explicitly.
  it('scales a full day and half day to the shift that was actually scheduled', () => {
    // The fixed 480/240 marks treated every shift as an eight hour one.
    expect(workingDayThresholds(dayShift)).toEqual({
      minWorkingMinutes: 540, // 540 span, no break
      halfDayAfterMinutes: 270,
    });
    expect(workingDayThresholds({ startTime: '08:00', endTime: '20:00' })).toEqual({
      minWorkingMinutes: 720, // 720 span, no break
      halfDayAfterMinutes: 360,
    });
  });

  it('scales an overnight shift off its true length, not its clock arithmetic', () => {
    expect(workingDayThresholds(nightShift)).toEqual({
      minWorkingMinutes: 480, // 22:00-06:00 is 480 across midnight, no break
      halfDayAfterMinutes: 240,
    });
  });

  it('floors the half day mark for an odd shift length', () => {
    expect(workingDayThresholds({ startTime: '09:00', endTime: '17:31' })).toEqual({
      minWorkingMinutes: 511,
      halfDayAfterMinutes: 255,
    });
  });

  it('takes the unpaid break off the scheduled span', () => {
    // Gross presence is what these marks are compared against, so the break has
    // to come off or a single late minute would cost half a day. A 09:00-18:00
    // shift with an hour break lands back on the historical 480/240.
    expect(workingDayThresholds({ ...dayShift, breakDurationMins: 60 })).toEqual({
      minWorkingMinutes: 480, // 540 span - 60 break
      halfDayAfterMinutes: 240,
    });
    expect(
      workingDayThresholds({ startTime: '08:00', endTime: '20:00', breakDurationMins: 180 }),
    ).toEqual({
      minWorkingMinutes: 540, // 720 span - 180 break
      halfDayAfterMinutes: 270,
    });
    expect(workingDayThresholds({ startTime: '08:00', endTime: '20:00', breakDurationMins: 60 })).toEqual({
      minWorkingMinutes: 660, // 720 span - 60 break, the service spec's split shift
      halfDayAfterMinutes: 330,
    });
    expect(workingDayThresholds({ ...nightShift, breakDurationMins: 60 })).toEqual({
      minWorkingMinutes: 420, // 480 span - 60 break
      halfDayAfterMinutes: 210,
    });
  });

  it('ignores a break at least as long as the shift', () => {
    expect(workingDayThresholds({ ...dayShift, breakDurationMins: 540 })).toEqual({
      minWorkingMinutes: 540, // falls back to the full span
      halfDayAfterMinutes: 270,
    });
  });

  it('falls back to configured values when the shift has no schedule to measure', () => {
    expect(
      workingDayThresholds({ minWorkingMinutes: 400, halfDayAfterMinutes: 200 }),
    ).toEqual({ minWorkingMinutes: 400, halfDayAfterMinutes: 200 });
  });

  it('falls back to the eight hour defaults with no shift at all', () => {
    expect(workingDayThresholds(null)).toEqual({
      minWorkingMinutes: 480,
      halfDayAfterMinutes: 240,
    });
  });
});

describe('overtimeAfterShiftEnd', () => {
  const punchedOutAt = (hour: number, minute: number, second = 0) =>
    overtimeAfterShiftEnd({
      punchIn: localAt(1, 9, 0),
      punchOut: new Date(2026, 5, 1, hour, minute, second),
      shift: dayShift,
    });

  it('bills nothing for leaving before the shift end', () => {
    expect(punchedOutAt(17, 30)).toBe(0);
  });

  it('bills nothing for leaving exactly at the shift end', () => {
    expect(punchedOutAt(18, 0)).toBe(0);
  });

  it('bills every minute clocked after the shift end', () => {
    expect(punchedOutAt(18, 45)).toBe(45);
    expect(punchedOutAt(19, 30)).toBe(90);
  });

  it('floors a part-minute overrun', () => {
    expect(punchedOutAt(18, 0, 45)).toBe(0);
    expect(punchedOutAt(18, 1, 30)).toBe(1);
  });

  it('ignores the break and the overtime threshold entirely', () => {
    // A 60m break and a 480m overtimeAfterMinutes used to cancel this out to 0.
    expect(
      overtimeAfterShiftEnd({
        punchIn: localAt(1, 9, 0),
        punchOut: localAt(1, 18, 30),
        shift: { ...dayShift, breakDurationMins: 60, overtimeAfterMinutes: 480 } as never,
      }),
    ).toBe(30);
  });

  describe('overnight shifts', () => {
    it('bills from the morning the shift actually ends', () => {
      expect(
        overtimeAfterShiftEnd({
          punchIn: localAt(1, 22, 0),
          punchOut: localAt(2, 7, 30),
          shift: nightShift,
        }),
      ).toBe(90);
    });

    it('bills nothing for clocking off before the overnight end', () => {
      expect(
        overtimeAfterShiftEnd({
          punchIn: localAt(1, 22, 0),
          punchOut: localAt(2, 5, 45),
          shift: nightShift,
        }),
      ).toBe(0);
    });
  });

  it('is undefined without a punch-out or a schedule to measure', () => {
    expect(overtimeAfterShiftEnd({ punchIn: localAt(1, 9, 0), shift: dayShift })).toBeUndefined();
    expect(overtimeAfterShiftEnd({ punchOut: localAt(1, 19, 0), shift: null })).toBeUndefined();
    expect(
      overtimeAfterShiftEnd({ punchOut: localAt(1, 19, 0), shift: { startTime: '09:00' } }),
    ).toBeUndefined();
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
