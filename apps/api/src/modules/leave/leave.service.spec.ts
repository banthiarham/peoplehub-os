import { BadRequestException } from '@nestjs/common';
import { LeaveService } from './leave.service';

describe('LeaveService', () => {
  const user = {
    tenantId: 'tenant-1',
    employeeId: 'emp-1',
    userId: 'user-1',
    email: 'employee@example.com',
    name: 'Employee',
    roles: ['Employee'],
    isSuperAdmin: false,
  };

  const leaveType = {
    id: 'lt-1',
    tenantId: 'tenant-1',
    name: 'Sick Leave',
    code: 'SL',
    isPaid: true,
    requiresAttachment: false,
    minDuration: 0.5,
    maxDuration: null,
    allowNegativeBalance: false,
    genderRestriction: null,
  };

  const policy = {
    id: 'policy-1',
    requiresAttachment: false,
    genderRestriction: null,
    employmentTypes: [],
    probationAllowed: true,
    noticePeriodAllowed: true,
    sandwichRule: false,
    minDuration: 0.5,
    maxDuration: null,
    allowNegativeBalance: false,
  };

  function prismaMock(options?: {
    weeklyOffDays?: number[];
    assignment?: { shift: { id: string; weeklyOffDays: number[] } } | null;
    fallbackWeeklyOffDays?: number[];
    holidays?: Date[];
    policy?: typeof policy;
  }) {
    return {
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'emp-1',
          status: 'CONFIRMED',
          gender: 'MALE',
          employmentType: 'FULL_TIME',
          locationId: 'loc-1',
        }),
      },
      leaveType: { findFirst: jest.fn().mockResolvedValue(leaveType) },
      leavePolicy: {
        findFirst: jest.fn().mockResolvedValue(options?.policy ?? policy),
      },
      holiday: {
        findMany: jest
          .fn()
          .mockResolvedValue((options?.holidays ?? []).map((date) => ({ date }))),
      },
      shiftAssignment: {
        findFirst: jest.fn().mockResolvedValue(
          options && 'assignment' in options
            ? options.assignment
            : {
                shift: {
                  id: 'shift-1',
                  weeklyOffDays: options?.weeklyOffDays ?? [0],
                },
              },
        ),
      },
      shift: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'fallback-shift',
          weeklyOffDays: options?.fallbackWeeklyOffDays ?? [0],
        }),
      },
      leaveBalance: {
        findUnique: jest.fn().mockResolvedValue({ balance: 10 }),
      },
      leaveRequest: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      },
    };
  }

  function apply(service: LeaveService, fromDate: string, toDate = fromDate, halfDay = false) {
    return service.apply(user as any, {
      leaveTypeId: 'lt-1',
      fromDate,
      toDate,
      halfDay: halfDay || undefined,
      reason: 'Medical',
    });
  }

  it('enforces leave policy attachment requirements before creating a request', async () => {
    const prisma = prismaMock({
      policy: { ...policy, requiresAttachment: true },
    });
    const service = new LeaveService(prisma as any);

    await expect(apply(service, '2026-07-06')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows Saturday when only Sunday is configured as a weekly off', async () => {
    const prisma = prismaMock({ weeklyOffDays: [0] });
    const service = new LeaveService(prisma as any);

    await expect(apply(service, '2026-07-25')).resolves.toMatchObject({ days: 1 });
  });

  it('rejects Sunday when Sunday is configured as a weekly off', async () => {
    const prisma = prismaMock({ weeklyOffDays: [0] });
    const service = new LeaveService(prisma as any);

    await expect(apply(service, '2026-07-26')).rejects.toThrow(
      'Selected range has no working days',
    );
  });

  it('selects the assignment effective on the requested date', async () => {
    const prisma = prismaMock({ weeklyOffDays: [0] });
    const service = new LeaveService(prisma as any);

    await apply(service, '2026-07-25');

    expect(prisma.shiftAssignment.findFirst).toHaveBeenCalledWith({
      where: {
        employeeId: 'emp-1',
        effectiveFrom: { lte: new Date('2026-07-25T00:00:00.000Z') },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date('2026-07-25T00:00:00.000Z') } },
        ],
      },
      include: { shift: true },
      orderBy: { effectiveFrom: 'desc' },
    });
  });

  it('uses the active tenant fallback shift for an unassigned employee', async () => {
    const prisma = prismaMock({ assignment: null, fallbackWeeklyOffDays: [0] });
    const service = new LeaveService(prisma as any);

    await expect(apply(service, '2026-07-25')).resolves.toMatchObject({ days: 1 });
    expect(prisma.shift.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', isActive: true },
    });
  });

  it('rejects half-day leave on a configured weekly off', async () => {
    const prisma = prismaMock({ weeklyOffDays: [0] });
    const service = new LeaveService(prisma as any);

    await expect(apply(service, '2026-07-26', '2026-07-26', true)).rejects.toThrow(
      'Selected range has no working days',
    );
  });

  it('counts configured working days in a range and excludes holidays', async () => {
    const prisma = prismaMock({
      weeklyOffDays: [0],
      holidays: [new Date('2026-07-27T00:00:00.000Z')],
    });
    const service = new LeaveService(prisma as any);

    await expect(apply(service, '2026-07-25', '2026-07-27')).resolves.toMatchObject({
      days: 1,
    });
  });

  it('preserves sandwich-rule duration behavior with configured weekly offs', async () => {
    const prisma = prismaMock({
      weeklyOffDays: [0],
      holidays: [new Date('2026-07-27T00:00:00.000Z')],
      policy: { ...policy, sandwichRule: true },
    });
    const service = new LeaveService(prisma as any);

    await expect(apply(service, '2026-07-25', '2026-07-27')).resolves.toMatchObject({
      days: 2,
    });
  });
});
