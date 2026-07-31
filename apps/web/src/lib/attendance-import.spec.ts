import {
  newAttendanceImportRow,
  parseAttendanceCsv,
  toAttendanceImportPayload,
  ATTENDANCE_IMPORT_TEMPLATE,
} from './attendance-import';

describe('parseAttendanceCsv', () => {
  it('leaves status empty when the file has no status column', () => {
    // Four columns only. The destructuring default used to fill in PRESENT
    // here, so every row of such a file imported as present.
    const rows = parseAttendanceCsv(
      [
        'employeeCode,date,punchIn,punchOut',
        'VH-1001,2026-07-15,09:00,18:00',
        'VH-1002,2026-07-15,09:30,09:40',
      ].join('\n'),
    );
    expect(rows.map((row) => row.status)).toEqual(['', '']);
  });

  it('leaves status empty when the column exists but the cell is blank', () => {
    const rows = parseAttendanceCsv(
      ['employeeCode,date,punchIn,punchOut,status', 'VH-1001,2026-07-15,09:00,18:00,'].join('\n'),
    );
    expect(rows[0].status).toBe('');
  });

  it('keeps a status the file states explicitly', () => {
    const rows = parseAttendanceCsv(
      [
        'employeeCode,date,punchIn,punchOut,status',
        'VH-1001,2026-07-15,09:00,18:00,ON_LEAVE',
        'VH-1002,2026-07-15,09:00,18:00,half_day',
      ].join('\n'),
    );
    expect(rows.map((row) => row.status)).toEqual(['ON_LEAVE', 'HALF_DAY']);
  });

  it('ships a template whose sample rows leave status blank', () => {
    const rows = parseAttendanceCsv(ATTENDANCE_IMPORT_TEMPLATE);
    expect(rows.filter((row) => row.status === '')).toHaveLength(2);
    expect(rows.some((row) => row.status === 'ON_LEAVE')).toBe(true);
  });
});

describe('newAttendanceImportRow', () => {
  it('starts a hand-added row with no status so it is derived', () => {
    expect(newAttendanceImportRow().status).toBe('');
  });
});

describe('toAttendanceImportPayload', () => {
  const row = (over: Partial<ReturnType<typeof newAttendanceImportRow>>) => ({
    ...newAttendanceImportRow(),
    employeeCode: 'VH-1001',
    date: '2026-07-15',
    ...over,
  });

  it('omits the status field entirely when it is blank', () => {
    const [payload] = toAttendanceImportPayload([row({ status: '' })]);
    // Present-but-empty would fail the API enum; absent means "derive".
    expect('status' in payload).toBe(false);
  });

  it('sends the status when one was pinned', () => {
    const [payload] = toAttendanceImportPayload([row({ status: 'ON_LEAVE' })]);
    expect(payload).toMatchObject({ status: 'ON_LEAVE' });
  });

  it('carries a whole status-less file through with no statuses at all', () => {
    const rows = parseAttendanceCsv(
      [
        'employeeCode,date,punchIn,punchOut',
        'VH-1001,2026-07-15,09:00,18:00',
        'VH-1002,2026-07-15,09:30,09:40',
        'VH-1003,2026-07-15,09:00,14:00',
      ].join('\n'),
    );
    const payload = toAttendanceImportPayload(rows);
    expect(payload).toHaveLength(3);
    expect(payload.every((entry) => !('status' in entry))).toBe(true);
  });
});
