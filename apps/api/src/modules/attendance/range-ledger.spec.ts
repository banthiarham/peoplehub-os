import { ConfigService } from '@nestjs/config';
import { AttendanceService } from './attendance.service';
import { AttendanceQrService } from './attendance-qr.service';
import { DeviceBindingService } from './device-binding.service';
import { ShiftResolutionService } from './shift-resolution.service';
import { PayrollPolicyService } from '../payroll/payroll-policy.service';

/**
 * `rangeLedger` is what the attendance register and summary exports are built
 * from, so these cover the two things a reviewer would notice first if they
 * broke: that unrecorded days appear at all (an absence is the absence of a
 * row, so a record dump omits every absentee), and that the derivation agrees
 * with the one the attendance screen already applies.
 */
describe('AttendanceService.rangeLedger', () => {
  const shift = {
    id: 'shift-1',
    name: 'General',
    weeklyOffDays: [0, 6],
    startTime: '09:00',
    endTime: '18:00',
    gracePeriodMins: 15,
    earlyLeavingGraceMins: 15,
  };

  const day = (date: string) => new Date(`${date}T00:00:00.000Z`);

  function newService(prisma: unknown): AttendanceService {
    const client = prisma as never;
    const config = new ConfigService();
    return new AttendanceService(
      client,
      new ShiftResolutionService(client),
      new DeviceBindingService(client, config),
      new AttendanceQrService(client, config),
      new PayrollPolicyService(client),
    );
  }

  function ledgerPrisma(options?: {
    records?: Array<Record<string, unknown>>;
    holidays?: string[];
    leaves?: Array<{
      employeeId: string;
      fromDate: string;
      toDate: string;
      leaveType?: { name: string };
    }>;
    assignments?: Array<Record<string, unknown>>;
    fallbackShift?: Record<string, unknown> | null;
    rules?: Array<Record<string, unknown>>;
  }) {
    return {
      employee: { findFirst: jest.fn().mockResolvedValue({ locationId: 'loc-1' }) },
      attendanceRecord: { findMany: jest.fn().mockResolvedValue(options?.records ?? []) },
      holiday: {
        findMany: jest.fn().mockResolvedValue(
          (options?.holidays ?? []).map((date) => ({ date: day(date) })),
        ),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue(
          (options?.leaves ?? []).map((leave) => ({
            employeeId: leave.employeeId,
            fromDate: day(leave.fromDate),
            toDate: day(leave.toDate),
            leaveType: leave.leaveType ?? { name: 'Casual Leave' },
          })),
        ),
      },
      shiftAssignment: { findMany: jest.fn().mockResolvedValue(options?.assignments ?? []) },
      shift: {
        findFirst: jest
          .fn()
          .mockResolvedValue(options && 'fallbackShift' in options ? options.fallbackShift : shift),
      },
      attendanceRule: { findMany: jest.fn().mockResolvedValue(options?.rules ?? []) },
    };
  }

  // A week fully in the past, so nothing is clamped to today.
  // 2026-06-01 is a Monday, so 06-06/06-07 are the weekend.
  const start = day('2026-06-01');
  const end = day('2026-06-07');
  const employees = [
    { id: 'emp-1', locationId: 'loc-1' },
    { id: 'emp-2', locationId: 'loc-2' },
  ];

  function statuses(days: Array<{ date: Date; status: string }>) {
    return Object.fromEntries(days.map((d) => [d.date.toISOString().slice(0, 10), d.status]));
  }

  it('derives record over leave over holiday over weekly off, then absent', async () => {
    const prisma = ledgerPrisma({
      records: [
        {
          employeeId: 'emp-1',
          date: day('2026-06-01'),
          status: 'PRESENT',
          punchIn: null,
          punchOut: null,
          workingMinutes: 480,
          shiftId: 'shift-1',
          isFinalized: true,
        },
      ],
      holidays: ['2026-06-03'],
      leaves: [{ employeeId: 'emp-1', fromDate: '2026-06-02', toDate: '2026-06-02' }],
    });

    const ledger = await newService(prisma).rangeLedger('tenant-1', employees, start, end);

    expect(statuses(ledger.get('emp-1')!)).toEqual({
      '2026-06-01': 'PRESENT',
      '2026-06-02': 'ON_LEAVE',
      '2026-06-03': 'HOLIDAY',
      '2026-06-04': 'ABSENT',
      '2026-06-05': 'ABSENT',
      '2026-06-06': 'WEEKEND',
      '2026-06-07': 'WEEKEND',
    });
    // The absences are the whole point: nothing writes an ABSENT record, so a
    // report that read the records alone would show emp-2 not at all. The
    // holiday is tenant-wide, so emp-2's week is four absences, not five, and
    // its leave is emp-1's alone.
    expect(statuses(ledger.get('emp-2')!)).toEqual({
      '2026-06-01': 'ABSENT',
      '2026-06-02': 'ABSENT',
      '2026-06-03': 'HOLIDAY',
      '2026-06-04': 'ABSENT',
      '2026-06-05': 'ABSENT',
      '2026-06-06': 'WEEKEND',
      '2026-06-07': 'WEEKEND',
    });
  });

  it('carries the approved leave type onto the day', async () => {
    const prisma = ledgerPrisma({
      leaves: [
        {
          employeeId: 'emp-1',
          fromDate: '2026-06-02',
          toDate: '2026-06-03',
          leaveType: { name: 'Sick Leave' },
        },
      ],
    });

    const ledger = await newService(prisma).rangeLedger('tenant-1', employees, start, end);
    const days = ledger.get('emp-1')!;

    expect(days.find((d) => d.date.getUTCDate() === 2)?.leaveType).toBe('Sick Leave');
    expect(days.find((d) => d.date.getUTCDate() === 3)?.leaveType).toBe('Sick Leave');
    expect(days.find((d) => d.date.getUTCDate() === 4)?.leaveType).toBeNull();
  });

  it('reports late and early minutes against the resolved shift', async () => {
    const prisma = ledgerPrisma({
      records: [
        {
          employeeId: 'emp-1',
          date: day('2026-06-01'),
          status: 'LATE',
          // Local wall clock, the convention shift-timing.ts evaluates in.
          punchIn: new Date(2026, 5, 1, 10, 0),
          punchOut: new Date(2026, 5, 1, 17, 0),
          workingMinutes: 420,
          overtimeMinutes: 0,
          shiftId: 'shift-1',
          isFinalized: false,
        },
      ],
    });

    const ledger = await newService(prisma).rangeLedger('tenant-1', employees, start, end);
    const first = ledger.get('emp-1')![0];

    // 09:00 + 15m grace = 09:15, so a 10:00 arrival is 45 minutes late.
    expect(first.lateByMinutes).toBe(45);
    expect(first.isLate).toBe(true);
    // 18:00 - 15m grace = 17:45, so leaving at 17:00 is 45 minutes early.
    expect(first.earlyDepartureMinutes).toBe(45);
    expect(first.isFinalized).toBe(false);
    expect(first.source).toBe('RECORD');
  });

  it('clamps each employee to their own joining and relieving dates', async () => {
    const ledger = await newService(ledgerPrisma()).rangeLedger(
      'tenant-1',
      [
        { id: 'emp-1', locationId: 'loc-1', joiningDate: day('2026-06-03') },
        { id: 'emp-2', locationId: 'loc-1', exitDate: day('2026-06-04') },
      ],
      start,
      end,
    );

    expect(Object.keys(statuses(ledger.get('emp-1')!))).toEqual([
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
      '2026-06-06',
      '2026-06-07',
    ]);
    expect(Object.keys(statuses(ledger.get('emp-2')!))).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
    ]);
  });

  it('stops at today rather than marking future days absent', async () => {
    const today = new Date();
    const monthStart = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1));
    const farFuture = new Date(Date.UTC(today.getFullYear() + 1, today.getMonth(), 1));

    const ledger = await newService(ledgerPrisma()).rangeLedger(
      'tenant-1',
      [{ id: 'emp-1', locationId: 'loc-1' }],
      monthStart,
      farFuture,
    );

    const last = ledger.get('emp-1')!.at(-1)!.date;
    expect(last.toISOString().slice(0, 10)).toBe(
      new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
        .toISOString()
        .slice(0, 10),
    );
  });

  it('honours the shift assigned on each day, batching one assignment query', async () => {
    const prisma = ledgerPrisma({
      assignments: [
        {
          employeeId: 'emp-1',
          effectiveFrom: day('2026-06-05'),
          effectiveTo: null,
          shift: { ...shift, id: 'shift-late', name: 'Late', weeklyOffDays: [0] },
        },
        {
          employeeId: 'emp-1',
          effectiveFrom: day('2026-06-01'),
          effectiveTo: day('2026-06-04'),
          shift: { ...shift, id: 'shift-early', name: 'Early', weeklyOffDays: [0, 6] },
        },
      ],
    });

    const ledger = await newService(prisma).rangeLedger('tenant-1', employees, start, end);
    const byDate = new Map(
      ledger.get('emp-1')!.map((d) => [d.date.toISOString().slice(0, 10), d]),
    );

    // Saturday 06-06 falls under the [0] shift, so it is a working day.
    expect(byDate.get('2026-06-06')?.status).toBe('ABSENT');
    expect(byDate.get('2026-06-06')?.shiftName).toBe('Late');
    expect(byDate.get('2026-06-02')?.shiftName).toBe('Early');
    // emp-2 has no assignment of its own and must not inherit emp-1's.
    expect(
      ledger.get('emp-2')!.find((d) => d.date.toISOString().startsWith('2026-06-06'))?.status,
    ).toBe('WEEKEND');
    // The batching this method exists for: one query for the whole set.
    expect(prisma.shiftAssignment.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.attendanceRecord.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.leaveRequest.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns an empty ledger without querying for no employees', async () => {
    const prisma = ledgerPrisma();

    const ledger = await newService(prisma).rangeLedger('tenant-1', [], start, end);

    expect(ledger.size).toBe(0);
    expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
  });
});
