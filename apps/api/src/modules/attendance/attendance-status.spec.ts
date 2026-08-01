import {
  attendanceRatio,
  DEFAULT_SCHEDULED_SHIFT_MINUTES,
  HALF_DAY_MIN_ATTENDANCE_PERCENTAGE,
  PRESENT_MIN_ATTENDANCE_PERCENTAGE,
  scheduledShiftMinutes,
  workedDayStatus,
} from './attendance-status';

/** 540 scheduled minutes: 25% is 135, 75% is 405. */
const dayShift = { startTime: '09:00', endTime: '18:00' };
/** 480 scheduled minutes across midnight: 25% is 120, 75% is 360. */
const nightShift = { startTime: '22:00', endTime: '06:00' };
/** 240 scheduled minutes: 25% is 60, 75% is 180. */
const shortShift = { startTime: '09:00', endTime: '13:00' };
/** 720 scheduled minutes: 25% is 180, 75% is 540. */
const longShift = { startTime: '08:00', endTime: '20:00' };

const statusOf = (workingMinutes: number, shift?: typeof dayShift | null) =>
  workedDayStatus({ workingMinutes, shift });

describe('attendance thresholds', () => {
  it('is a full day at 75% of the shift and a half day at 25%', () => {
    expect(PRESENT_MIN_ATTENDANCE_PERCENTAGE).toBe(75);
    expect(HALF_DAY_MIN_ATTENDANCE_PERCENTAGE).toBe(25);
  });
});

describe('scheduledShiftMinutes', () => {
  it('measures the gross span, break and configured marks ignored', () => {
    expect(scheduledShiftMinutes(dayShift)).toBe(540);
    expect(
      scheduledShiftMinutes({
        ...dayShift,
        breakDurationMins: 60,
        minWorkingMinutes: 480,
      } as never),
    ).toBe(540);
  });

  it('measures an overnight shift across midnight', () => {
    expect(scheduledShiftMinutes(nightShift)).toBe(480);
  });

  it('falls back to eight hours when no shift resolves', () => {
    expect(scheduledShiftMinutes(null)).toBe(DEFAULT_SCHEDULED_SHIFT_MINUTES);
    expect(scheduledShiftMinutes({ startTime: '09:00', endTime: null })).toBe(480);
  });
});

describe('attendanceRatio', () => {
  it('reports the share of the shift that was attended', () => {
    expect(attendanceRatio({ workingMinutes: 270, shift: dayShift })).toMatchObject({
      workingMinutes: 270,
      scheduledMinutes: 540,
      ratio: 0.5,
      percentage: 50,
    });
  });

  it('rounds the reported percentage to two decimals', () => {
    // 180/540 is 33.333…%, the case the fix is named after.
    expect(attendanceRatio({ workingMinutes: 180, shift: dayShift }).percentage).toBe(33.33);
  });

  it('reports over 100% for a day worked past the shift, still PRESENT', () => {
    expect(attendanceRatio({ workingMinutes: 630, shift: dayShift })).toMatchObject({
      percentage: 116.67,
      status: 'PRESENT',
    });
  });

  it('floors a negative span at zero rather than scoring it', () => {
    expect(attendanceRatio({ workingMinutes: -30, shift: dayShift })).toMatchObject({
      workingMinutes: 0,
      ratio: 0,
      percentage: 0,
      status: 'ABSENT',
    });
  });

  it('decides the boundary on the exact ratio, not the rounded percentage', () => {
    // 511 minute shift: 74.95% rounds to 74.95 and stays a half day; the mark
    // itself is 383.25 minutes, so 384 is the first full day.
    const oddShift = { startTime: '09:00', endTime: '17:31' };
    expect(attendanceRatio({ workingMinutes: 383, shift: oddShift })).toMatchObject({
      percentage: 74.95,
      status: 'HALF_DAY',
    });
    expect(attendanceRatio({ workingMinutes: 384, shift: oddShift }).status).toBe('PRESENT');
  });
});

describe('workedDayStatus', () => {
  it('does not mark three hours of a 09:00-18:00 shift ABSENT', () => {
    // The reported bug: 180/540 is 33%, which is attendance, not an absence.
    expect(statusOf(180, dayShift)).toBe('HALF_DAY');
  });

  describe('a 09:00-18:00 shift', () => {
    it('is ABSENT below the 135 minute quarter mark', () => {
      expect(statusOf(0, dayShift)).toBe('ABSENT');
      expect(statusOf(10, dayShift)).toBe('ABSENT');
      expect(statusOf(134, dayShift)).toBe('ABSENT');
    });

    it('is HALF_DAY from 135 minutes up to but not including 405', () => {
      expect(statusOf(135, dayShift)).toBe('HALF_DAY');
      expect(statusOf(270, dayShift)).toBe('HALF_DAY');
      expect(statusOf(404, dayShift)).toBe('HALF_DAY');
    });

    it('is PRESENT from 405 minutes up', () => {
      expect(statusOf(405, dayShift)).toBe('PRESENT');
      expect(statusOf(480, dayShift)).toBe('PRESENT');
      expect(statusOf(540, dayShift)).toBe('PRESENT');
    });
  });

  describe('a four hour shift', () => {
    // The same percentages against a much shorter schedule: a fixed 240/480
    // minute rule made every short shift unattendable.
    it('is ABSENT below 60 minutes', () => {
      expect(statusOf(59, shortShift)).toBe('ABSENT');
    });

    it('is HALF_DAY from 60 minutes and PRESENT from 180', () => {
      expect(statusOf(60, shortShift)).toBe('HALF_DAY');
      expect(statusOf(179, shortShift)).toBe('HALF_DAY');
      expect(statusOf(180, shortShift)).toBe('PRESENT');
      expect(statusOf(240, shortShift)).toBe('PRESENT');
    });
  });

  describe('a twelve hour shift', () => {
    it('holds a long day to the same share of its own schedule', () => {
      expect(statusOf(179, longShift)).toBe('ABSENT');
      expect(statusOf(180, longShift)).toBe('HALF_DAY');
      expect(statusOf(539, longShift)).toBe('HALF_DAY');
      expect(statusOf(540, longShift)).toBe('PRESENT');
      // 480 minutes is a full day on an eight hour shift but not on this one.
      expect(statusOf(480, longShift)).toBe('HALF_DAY');
    });
  });

  describe('an overnight shift', () => {
    it('scores against the true 480 minute length, not the clock arithmetic', () => {
      expect(statusOf(119, nightShift)).toBe('ABSENT');
      expect(statusOf(120, nightShift)).toBe('HALF_DAY');
      expect(statusOf(359, nightShift)).toBe('HALF_DAY');
      expect(statusOf(360, nightShift)).toBe('PRESENT');
    });
  });

  describe('with no shift to measure', () => {
    it('scores against the eight hour fallback span', () => {
      expect(statusOf(119, null)).toBe('ABSENT');
      expect(statusOf(120, null)).toBe('HALF_DAY');
      expect(statusOf(359, null)).toBe('HALF_DAY');
      expect(statusOf(360, null)).toBe('PRESENT');
    });
  });
});
