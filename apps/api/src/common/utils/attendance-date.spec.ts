import {
  parseAttendanceDate,
  parseAttendanceDateOrError,
  SUPPORTED_ATTENDANCE_DATE_FORMATS,
} from './attendance-date';

const iso = (date: Date | null) => date?.toISOString() ?? null;

describe('parseAttendanceDate', () => {
  it('normalizes YYYY-MM-DD to its UTC day', () => {
    expect(iso(parseAttendanceDate('2026-07-01'))).toBe('2026-07-01T00:00:00.000Z');
  });

  it('normalizes an ISO 8601 datetime to the calendar day it names', () => {
    expect(iso(parseAttendanceDate('2026-07-01T00:00:00.000Z'))).toBe('2026-07-01T00:00:00.000Z');
    expect(iso(parseAttendanceDate('2026-07-01T23:30:00.000Z'))).toBe('2026-07-01T00:00:00.000Z');
  });

  it('keeps the written day for an offset-bearing timestamp instead of shifting it', () => {
    // 2026-07-01T00:00+05:30 is 2026-06-30T18:30Z; the uploader meant July 1st.
    expect(iso(parseAttendanceDate('2026-07-01T00:00:00.000+05:30'))).toBe(
      '2026-07-01T00:00:00.000Z',
    );
  });

  it('does not shift the day with the server timezone', () => {
    // The whole point of not going through `new Date(value).getDate()`, which
    // lands on 2026-06-30 in every negative UTC offset.
    const originalTz = process.env.TZ;
    try {
      for (const zone of ['UTC', 'America/New_York', 'Asia/Kolkata', 'Pacific/Kiritimati']) {
        process.env.TZ = zone;
        expect(iso(parseAttendanceDate('2026-07-01'))).toBe('2026-07-01T00:00:00.000Z');
        expect(iso(parseAttendanceDate('2026-07-01T00:00:00.000Z'))).toBe(
          '2026-07-01T00:00:00.000Z',
        );
      }
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it('rejects ambiguous and malformed values', () => {
    for (const value of ['01/07/2026', '07-01-2026', '1 July 2026', '2026-02-30', '', '  ', null]) {
      expect(parseAttendanceDate(value)).toBeNull();
    }
  });

  it('reports the supported formats in the row-level error', () => {
    const result = parseAttendanceDateOrError('01/07/2026');
    expect(result).toEqual({
      error: `Unsupported date "01/07/2026" — use ${SUPPORTED_ATTENDANCE_DATE_FORMATS}`,
    });
  });
});
