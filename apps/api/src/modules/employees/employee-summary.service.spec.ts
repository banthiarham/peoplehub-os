import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmployeeSummaryService } from './employee-summary.service';

describe('EmployeeSummaryService', () => {
  const hrUser = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    email: 'hr@example.com',
    name: 'HR User',
    isSuperAdmin: false,
    employeeId: 'hr-employee',
    roles: ['HR Admin'],
  } as any;

  const employee = {
    id: 'emp-1',
    status: 'ACTIVE',
    joiningDate: new Date('2024-04-01T00:00:00.000Z'),
    exitDate: null,
  };

  const ledger = {
    month: '2026-06',
    windowStart: new Date('2026-06-01T00:00:00.000Z'),
    windowEnd: new Date('2026-06-30T00:00:00.000Z'),
    clampedToToday: false,
    days: [],
    counts: { expectedWorkingDays: 22, present: 20, onLeave: 2, attendancePercentage: 100 },
  };

  function deps(options?: {
    employee?: typeof employee | null;
    monthRequests?: Array<Record<string, unknown>>;
    balances?: Array<Record<string, unknown>>;
  }) {
    const prisma = {
      employee: {
        findFirst: jest
          .fn()
          .mockResolvedValue(options && 'employee' in options ? options.employee : employee),
      },
    };
    const attendance = { monthlyLedgerFor: jest.fn().mockResolvedValue(ledger) };
    const leave = {
      balances: jest.fn().mockResolvedValue(
        options?.balances ?? [
          {
            leaveTypeId: 'lt-1',
            openingBalance: 12,
            accrued: 6,
            used: 4,
            balance: 14,
            leaveType: { name: 'Casual Leave', code: 'CL', isPaid: true },
          },
        ],
      ),
      list: jest
        .fn()
        .mockResolvedValueOnce({ data: options?.monthRequests ?? [] })
        .mockResolvedValueOnce({
          data: [
            {
              id: 'lr-1',
              leaveTypeId: 'lt-1',
              leaveType: { name: 'Casual Leave', code: 'CL' },
              fromDate: new Date('2026-06-10T00:00:00.000Z'),
              toDate: new Date('2026-06-11T00:00:00.000Z'),
              days: 2,
              status: 'APPROVED',
              reason: 'Family event',
            },
          ],
        }),
    };
    return { prisma, attendance, leave };
  }

  function build(options?: Parameters<typeof deps>[0]) {
    const { prisma, attendance, leave } = deps(options);
    return {
      prisma,
      attendance,
      leave,
      service: new EmployeeSummaryService(prisma as any, attendance as any, leave as any),
    };
  }

  it('rejects a caller without an HR or admin role', async () => {
    const { service, prisma } = build();

    await expect(
      service.attendanceSummary({ ...hrUser, roles: ['Employee'] }, 'emp-1', '2026-06'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.employee.findFirst).not.toHaveBeenCalled();
  });

  it('allows HR Admin, Tenant Owner and super admins', async () => {
    await expect(
      build().service.attendanceSummary(hrUser, 'emp-1', '2026-06'),
    ).resolves.toMatchObject({ month: '2026-06' });
    await expect(
      build().service.attendanceSummary({ ...hrUser, roles: ['Tenant Owner'] }, 'emp-1', '2026-06'),
    ).resolves.toMatchObject({ month: '2026-06' });
    await expect(
      build().service.attendanceSummary(
        { ...hrUser, isSuperAdmin: true, roles: [] },
        'emp-1',
        '2026-06',
      ),
    ).resolves.toMatchObject({ month: '2026-06' });
  });

  it('scopes the employee lookup to the tenant and 404s on a cross-tenant id', async () => {
    const { service, prisma } = build({ employee: null });

    await expect(service.attendanceSummary(hrUser, 'other-tenant-emp', '2026-06')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'other-tenant-emp', tenantId: 'tenant-1' } }),
    );
  });

  it('composes the ledger, balances, in-month leave and recent history', async () => {
    const { service, attendance, leave } = build({
      monthRequests: [
        {
          leaveTypeId: 'lt-1',
          leaveType: { name: 'Casual Leave', code: 'CL' },
          fromDate: new Date('2026-06-10T00:00:00.000Z'),
          toDate: new Date('2026-06-11T00:00:00.000Z'),
          days: 2,
          status: 'APPROVED',
        },
        {
          leaveTypeId: 'lt-2',
          leaveType: { name: 'Sick Leave', code: 'SL' },
          fromDate: new Date('2026-06-20T00:00:00.000Z'),
          toDate: new Date('2026-06-20T00:00:00.000Z'),
          days: 1,
          status: 'PENDING',
        },
      ],
    });

    const summary = await service.attendanceSummary(hrUser, 'emp-1', '2026-06');

    expect(attendance.monthlyLedgerFor).toHaveBeenCalledWith('tenant-1', 'emp-1', '2026-06', {
      joiningDate: employee.joiningDate,
      exitDate: null,
    });
    expect(summary.attendance).toBe(ledger.counts);
    expect(summary.window).toEqual({
      start: ledger.windowStart,
      end: ledger.windowEnd,
      clampedToToday: false,
    });
    expect(summary.leave.calendarDaysOnLeave).toBe(2);
    // Pending requests never contribute to the per-type breakdown.
    expect(summary.leave.byType).toEqual([
      { leaveTypeId: 'lt-1', name: 'Casual Leave', code: 'CL', policyDays: 2 },
    ]);
    expect(summary.leave.balances).toEqual([
      {
        leaveTypeId: 'lt-1',
        name: 'Casual Leave',
        code: 'CL',
        isPaid: true,
        opening: 12,
        accrued: 6,
        used: 4,
        balance: 14,
      },
    ]);
    expect(summary.recentLeaveHistory).toHaveLength(1);
    expect(leave.list).toHaveBeenNthCalledWith(1, 'tenant-1', {
      employeeId: 'emp-1',
      from: '2026-06-01',
      to: '2026-06-30',
      pageSize: 100,
    });
    expect(leave.list).toHaveBeenNthCalledWith(2, 'tenant-1', {
      employeeId: 'emp-1',
      pageSize: 5,
    });
  });

  it('clips a month-straddling leave to the days inside the window', async () => {
    const { service } = build({
      monthRequests: [
        {
          leaveTypeId: 'lt-1',
          leaveType: { name: 'Casual Leave', code: 'CL' },
          fromDate: new Date('2026-05-28T00:00:00.000Z'),
          toDate: new Date('2026-06-02T00:00:00.000Z'),
          days: 5,
          status: 'APPROVED',
        },
      ],
    });

    const summary = await service.attendanceSummary(hrUser, 'emp-1', '2026-06');

    expect(summary.leave.byType).toEqual([
      { leaveTypeId: 'lt-1', name: 'Casual Leave', code: 'CL', policyDays: 2 },
    ]);
  });

  it('defaults to the current month when none is supplied', async () => {
    const { service, attendance } = build();
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const summary = await service.attendanceSummary(hrUser, 'emp-1');

    expect(summary.month).toBe(expected);
    expect(attendance.monthlyLedgerFor).toHaveBeenCalledWith(
      'tenant-1',
      'emp-1',
      expected,
      expect.anything(),
    );
  });

  it('reads leave balances for the year of the requested month', async () => {
    const { service, leave } = build();

    await service.attendanceSummary(hrUser, 'emp-1', '2025-11');

    expect(leave.balances).toHaveBeenCalledWith('tenant-1', 'emp-1', 2025);
  });
});
