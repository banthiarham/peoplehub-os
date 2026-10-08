import ExcelJS from 'exceljs';
import type { RangeLedgerDay } from '../attendance/attendance.service';
import { buildWorkbook } from '../../common/utils/xlsx';
import { toLabelledCsv } from '../../common/utils/csv';
import {
  buildRegisterRows,
  buildSummaryRows,
  durationHhMm,
  durationHours,
  groupRowsByMonth,
  REGISTER_COLUMNS,
  SUMMARY_COLUMNS,
  type ReportEmployee,
} from './attendance-report';

const day = (date: string) => new Date(`${date}T00:00:00.000Z`);

function ledgerDay(date: string, overrides: Partial<RangeLedgerDay> = {}): RangeLedgerDay {
  return {
    date: day(date),
    status: 'PRESENT',
    source: 'RECORD',
    punchIn: null,
    punchOut: null,
    workingMinutes: null,
    netMinutes: null,
    overtimeMinutes: null,
    isLate: false,
    lateByMinutes: 0,
    isEarlyDeparture: false,
    earlyDepartureMinutes: 0,
    shiftId: 'shift-1',
    shiftName: 'General',
    shiftStartTime: '09:00',
    shiftEndTime: '18:00',
    locationId: 'loc-1',
    leaveType: null,
    punchSource: 'BIOMETRIC',
    isFinalized: true,
    remarks: null,
    ...overrides,
  };
}

const employees: ReportEmployee[] = [
  {
    id: 'emp-2',
    employeeCode: 'EMP0150',
    firstName: 'Arjun',
    lastName: 'Nair',
    departmentName: 'Sales',
    locationName: 'Pune HQ',
  },
  {
    id: 'emp-1',
    employeeCode: 'EMP0142',
    firstName: 'Ritu',
    lastName: 'Sharma',
    departmentName: 'Engineering',
    locationName: 'Pune HQ',
    joiningDate: day('2025-04-01'),
  },
];

describe('attendance register rows', () => {
  it('orders employee-major then date-ascending so a person reads as one block', () => {
    const ledger = new Map<string, RangeLedgerDay[]>([
      // Deliberately out of order: the builder, not the caller, owns the sort.
      ['emp-1', [ledgerDay('2026-10-01'), ledgerDay('2026-09-02'), ledgerDay('2026-09-01')]],
      ['emp-2', [ledgerDay('2026-09-01')]],
    ]);

    const rows = buildRegisterRows(employees, ledger);

    expect(rows.map((row) => [row.employeeCode, row.date])).toEqual([
      ['EMP0142', '2026-09-01'],
      ['EMP0142', '2026-09-02'],
      ['EMP0142', '2026-10-01'],
      ['EMP0150', '2026-09-01'],
    ]);
  });

  it('labels every status, including the days a record dump has no row for', () => {
    const ledger = new Map<string, RangeLedgerDay[]>([
      [
        'emp-1',
        [
          ledgerDay('2026-09-01', { status: 'PRESENT' }),
          ledgerDay('2026-09-02', { status: 'LATE' }),
          ledgerDay('2026-09-03', { status: 'ABSENT', source: 'DERIVED', isFinalized: false }),
          ledgerDay('2026-09-04', {
            status: 'ON_LEAVE',
            source: 'DERIVED',
            leaveType: 'Casual Leave',
          }),
          ledgerDay('2026-09-05', { status: 'WEEKEND', source: 'DERIVED' }),
          ledgerDay('2026-09-07', { status: 'HOLIDAY', source: 'DERIVED' }),
          ledgerDay('2026-09-08', { status: 'HALF_DAY' }),
          ledgerDay('2026-09-09', { status: 'MISSING_PUNCH' }),
        ],
      ],
    ]);

    const rows = buildRegisterRows([employees[1]], ledger);

    expect(rows.map((row) => row.status)).toEqual([
      'Present',
      'Late',
      'Absent',
      'On Leave',
      'Weekly Off',
      'Holiday',
      'Half Day',
      'Missing Punch',
    ]);
    expect(rows[3].leaveType).toBe('Casual Leave');
    // A derived working day carries the reason its cells are blank.
    expect(rows[2].remarks).toBe('No attendance record');
    // A derived leave day does not: its Leave Type already explains itself.
    expect(rows[3].remarks).toBe('');
    // Nor does a derived non-working day — it is blank because it is a day off.
    expect(rows[4].remarks).toBe('');
    expect(rows[2].finalized).toBe('');
    expect(rows[0].finalized).toBe('Yes');
  });

  it('renders punches as local HH:MM and durations as hours, not raw minutes', () => {
    const ledger = new Map<string, RangeLedgerDay[]>([
      [
        'emp-1',
        [
          ledgerDay('2026-09-01', {
            // Local wall clock, the convention shift-timing.ts evaluates in.
            punchIn: new Date(2026, 8, 1, 9, 2),
            punchOut: new Date(2026, 8, 1, 18, 11),
            workingMinutes: 549,
            overtimeMinutes: 30,
            lateByMinutes: 0,
          }),
        ],
      ],
    ]);

    const [row] = buildRegisterRows([employees[1]], ledger);

    expect(row.checkIn).toBe('09:02');
    expect(row.checkOut).toBe('18:11');
    expect(row.workedHours).toBe('09:09');
    expect(row.workedHoursDecimal).toBe(9.15);
    expect(row.overtimeHours).toBe(0.5);
    expect(row.day).toBe('Tue');
    expect(row.month).toBe('Sep 2026');
    expect(row.source).toBe('Biometric');
  });

  it('flags a half-finished punch pair', () => {
    const ledger = new Map<string, RangeLedgerDay[]>([
      [
        'emp-1',
        [
          ledgerDay('2026-09-01', {
            status: 'MISSING_PUNCH',
            punchIn: new Date(2026, 8, 1, 9, 2),
            remarks: 'Imported from biometric',
          }),
        ],
      ],
    ]);

    const [row] = buildRegisterRows([employees[1]], ledger);

    expect(row.remarks).toBe('Imported from biometric; Missing punch out');
  });

  it('can drop weekly offs and holidays while keeping every attendable day', () => {
    const ledger = new Map<string, RangeLedgerDay[]>([
      [
        'emp-1',
        [
          ledgerDay('2026-09-01', { status: 'PRESENT' }),
          ledgerDay('2026-09-05', { status: 'WEEKEND', source: 'DERIVED' }),
          ledgerDay('2026-09-07', { status: 'HOLIDAY', source: 'DERIVED' }),
          ledgerDay('2026-09-08', { status: 'ABSENT', source: 'DERIVED' }),
        ],
      ],
    ]);

    const rows = buildRegisterRows([employees[1]], ledger, { includeNonWorkingDays: false });

    expect(rows.map((row) => row.status)).toEqual(['Present', 'Absent']);
  });
});

describe('attendance summary rows', () => {
  const twoMonths = new Map<string, RangeLedgerDay[]>([
    [
      'emp-1',
      [
        // September: 2 present (one 8h, one 9h), 1 late, 1 half day, 1 absent,
        // 1 leave, 1 weekly off, 1 holiday.
        ledgerDay('2026-09-01', { status: 'PRESENT', workingMinutes: 480 }),
        ledgerDay('2026-09-02', { status: 'PRESENT', workingMinutes: 540, overtimeMinutes: 60 }),
        ledgerDay('2026-09-03', { status: 'LATE', workingMinutes: 450, lateByMinutes: 20 }),
        ledgerDay('2026-09-04', { status: 'HALF_DAY', workingMinutes: 240 }),
        ledgerDay('2026-09-08', { status: 'ABSENT', source: 'DERIVED' }),
        ledgerDay('2026-09-09', {
          status: 'ON_LEAVE',
          source: 'DERIVED',
          leaveType: 'Casual Leave',
        }),
        ledgerDay('2026-09-05', { status: 'WEEKEND', source: 'DERIVED' }),
        ledgerDay('2026-09-07', { status: 'HOLIDAY', source: 'DERIVED' }),
        // October, so the range spans two months.
        ledgerDay('2026-10-01', { status: 'PRESENT', workingMinutes: 480, isFinalized: false }),
      ],
    ],
  ]);

  it('emits one row per employee per month rather than merging the range', () => {
    const rows = buildSummaryRows([employees[1]], twoMonths);

    expect(rows.map((row) => [row.month, row.calendarDays])).toEqual([
      ['Sep 2026', 8],
      ['Oct 2026', 1],
    ]);
  });

  it('counts each status and reuses the ledger attendance-percentage formula', () => {
    const [september] = buildSummaryRows([employees[1]], twoMonths);

    expect(september).toMatchObject({
      employeeCode: 'EMP0142',
      employeeName: 'Ritu Sharma',
      department: 'Engineering',
      joiningDate: '2025-04-01',
      relievingDate: '',
      present: 2,
      late: 1,
      halfDay: 1,
      absent: 1,
      onLeave: 1,
      weeklyOff: 1,
      holiday: 1,
      missingPunch: 0,
      // 8 days less the weekly off and the holiday.
      expectedWorkingDays: 6,
      overtimeHours: 1,
    });
    // (2 present + 1 late + 0.5 half day) / (6 expected - 1 leave) = 70%.
    expect(september.attendancePercentage).toBe(70);
    // 480 + 540 + 450 + 240 = 1710 minutes over four worked days.
    expect(september.workedHours).toBe('28:30');
    expect(september.avgHoursPerDay).toBe(7.13);
  });

  it('separates the days payroll would count from the days it would not', () => {
    const rows = buildSummaryRows([employees[1]], twoMonths);

    // Derived days are neither: only a stored record can be finalized.
    expect(rows[0]).toMatchObject({ finalizedDays: 4, unfinalizedDays: 0 });
    expect(rows[1]).toMatchObject({ finalizedDays: 0, unfinalizedDays: 1 });
  });

  it('leaves the percentage empty when no day was attendable', () => {
    const ledger = new Map<string, RangeLedgerDay[]>([
      ['emp-1', [ledgerDay('2026-09-05', { status: 'WEEKEND', source: 'DERIVED' })]],
    ]);

    const [row] = buildSummaryRows([employees[1]], ledger);

    expect(row.attendancePercentage).toBeNull();
    expect(row.avgHoursPerDay).toBeNull();
  });

  it('carries no payroll figure: this phase computes none', () => {
    const keys = SUMMARY_COLUMNS.map((column) => column.key.toLowerCase());

    for (const forbidden of ['lop', 'payable', 'denominator', 'compoff', 'lwp']) {
      expect(keys.some((key) => key.includes(forbidden))).toBe(false);
    }
  });
});

describe('month grouping', () => {
  it('orders sheets chronologically whatever order the rows arrive in', () => {
    // An employee who joined in October is emitted before one who has both
    // months, so insertion order alone would put October's sheet first.
    const ledger = new Map<string, RangeLedgerDay[]>([
      ['emp-2', [ledgerDay('2026-10-01')]],
      ['emp-1', [ledgerDay('2026-09-01'), ledgerDay('2026-10-02')]],
    ]);
    const rows = buildRegisterRows(employees, ledger);

    expect(groupRowsByMonth(rows).map((group) => group.label)).toEqual(['Sep 2026', 'Oct 2026']);
  });
});

describe('durations', () => {
  it('formats minutes both ways and tolerates a missing value', () => {
    expect(durationHhMm(498)).toBe('08:18');
    expect(durationHhMm(0)).toBe('00:00');
    expect(durationHhMm(1710)).toBe('28:30');
    expect(durationHhMm(null)).toBe('');
    expect(durationHours(498)).toBe(8.3);
    expect(durationHours(null)).toBeNull();
  });
});

describe('export files', () => {
  const ledger = new Map<string, RangeLedgerDay[]>([
    ['emp-1', [ledgerDay('2026-09-01', { workingMinutes: 498 }), ledgerDay('2026-10-01')]],
  ]);

  it('writes CSV with reviewer-facing headers rather than object keys', () => {
    const csv = toLabelledCsv(REGISTER_COLUMNS, buildRegisterRows([employees[1]], ledger));
    const [header, first] = csv.split('\n');

    expect(header.startsWith('Month,Date,Day,Employee Code,Employee Name')).toBe(true);
    expect(header).toContain('Worked Hours');
    expect(header).not.toContain('workingMinutes');
    expect(first).toContain('Sep 2026,2026-09-01,Tue,EMP0142,Ritu Sharma');
  });

  it('emits the header even with no rows, so the file still opens as a sheet', () => {
    expect(toLabelledCsv(SUMMARY_COLUMNS, [])).toBe(
      SUMMARY_COLUMNS.map((column) => column.label).join(','),
    );
  });

  it('builds a workbook with a frozen header, filters and a sheet per month', async () => {
    const rows = buildRegisterRows([employees[1]], ledger);
    const months = groupRowsByMonth(rows);
    const buffer = await buildWorkbook(
      [
        { name: 'All Months', columns: REGISTER_COLUMNS, rows, frozenColumns: 5, bandByKey: 'employeeCode' },
        ...months.map((month) => ({
          name: month.label,
          columns: REGISTER_COLUMNS,
          rows: month.rows,
          frozenColumns: 5,
          bandByKey: 'employeeCode',
        })),
      ],
      { name: 'Report Info', title: 'Attendance export', entries: [['Period', '2026-09-01 to 2026-10-01']] },
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'All Months',
      'Sep 2026',
      'Oct 2026',
      'Report Info',
    ]);
    const sheet = workbook.getWorksheet('All Months')!;
    expect(sheet.getRow(1).getCell(1).value).toBe('Month');
    expect(sheet.getRow(1).getCell(13).value).toBe('Worked Hours');
    expect(sheet.getRow(2).getCell(13).value).toBe('08:18');
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', xSplit: 5, ySplit: 1 });
    expect(sheet.autoFilter).toBeTruthy();
    // Header plus the two register rows.
    expect(sheet.rowCount).toBe(3);
    expect(workbook.getWorksheet('Sep 2026')!.rowCount).toBe(2);
  });

  it('keeps a sheet name Excel will accept', async () => {
    const buffer = await buildWorkbook([
      {
        name: 'A name far too long for Excel [with] illegal/chars',
        columns: SUMMARY_COLUMNS,
        rows: [],
      },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    const [name] = workbook.worksheets.map((sheet) => sheet.name);
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[[\]:*?/\\]/);
  });
});
