import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  ASSIGNMENT_PRECEDENCE,
  ShiftResolutionService,
} from '../attendance/shift-resolution.service';
import { LeaveService } from './leave.service';

/** Leave resolves shifts through the same service attendance does. */
function newLeaveService(prisma: unknown): LeaveService {
  return new LeaveService(
    prisma as never,
    {} as never,
    new ShiftResolutionService(prisma as never),
  );
}

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

  function apply(
    service: LeaveService,
    fromDate: string,
    toDate = fromDate,
    halfDay = false,
  ) {
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
    const service = newLeaveService(prisma);

    await expect(apply(service, '2026-07-06')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('allows Saturday when only Sunday is configured as a weekly off', async () => {
    const prisma = prismaMock({ weeklyOffDays: [0] });
    const service = newLeaveService(prisma);

    await expect(apply(service, '2026-07-25')).resolves.toMatchObject({
      days: 1,
    });
  });

  it('rejects Sunday when Sunday is configured as a weekly off', async () => {
    const prisma = prismaMock({ weeklyOffDays: [0] });
    const service = newLeaveService(prisma);

    await expect(apply(service, '2026-07-26')).rejects.toThrow(
      'Selected range has no working days',
    );
  });

  it('selects the assignment effective on the requested date', async () => {
    const prisma = prismaMock({ weeklyOffDays: [0] });
    const service = newLeaveService(prisma);

    await apply(service, '2026-07-25');

    // Same tenant-scoped, deterministically ordered query attendance uses.
    expect(prisma.shiftAssignment.findFirst).toHaveBeenCalledWith({
      where: {
        employeeId: 'emp-1',
        employee: { tenantId: 'tenant-1' },
        effectiveFrom: {
          lte: new Date('2026-07-25T00:00:00.000Z'),
        },
        OR: [
          { effectiveTo: null },
          {
            effectiveTo: {
              gte: new Date('2026-07-25T00:00:00.000Z'),
            },
          },
        ],
      },
      include: { shift: true },
      orderBy: ASSIGNMENT_PRECEDENCE,
    });
  });

  it('uses the active tenant fallback shift for an unassigned employee', async () => {
    const prisma = prismaMock({
      assignment: null,
      fallbackWeeklyOffDays: [0],
    });
    const service = newLeaveService(prisma);

    await expect(apply(service, '2026-07-25')).resolves.toMatchObject({
      days: 1,
    });

    expect(prisma.shift.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        isActive: true,
        isDefault: true,
      },
    });
  });

  it('rejects half-day leave on a configured weekly off', async () => {
    const prisma = prismaMock({ weeklyOffDays: [0] });
    const service = newLeaveService(prisma);

    await expect(
      apply(service, '2026-07-26', '2026-07-26', true),
    ).rejects.toThrow('Selected range has no working days');
  });

  it('counts configured working days in a range and excludes holidays', async () => {
    const prisma = prismaMock({
      weeklyOffDays: [0],
      holidays: [new Date('2026-07-27T00:00:00.000Z')],
    });
    const service = newLeaveService(prisma);

    await expect(
      apply(service, '2026-07-25', '2026-07-27'),
    ).resolves.toMatchObject({
      days: 1,
    });
  });

  it('reads balances for the requested year and defaults to the current one', async () => {
    const prisma = { leaveBalance: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = newLeaveService(prisma);

    await service.balances('tenant-1', 'emp-1', 2025);
    await service.balances('tenant-1', 'emp-1');

    expect(prisma.leaveBalance.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { employee: { tenantId: 'tenant-1' }, employeeId: 'emp-1', year: 2025 },
      }),
    );
    expect(prisma.leaveBalance.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          employee: { tenantId: 'tenant-1' },
          employeeId: 'emp-1',
          year: new Date().getFullYear(),
        },
      }),
    );
  });

  it('preserves sandwich-rule duration behavior with configured weekly offs', async () => {
    const prisma = prismaMock({
      weeklyOffDays: [0],
      holidays: [new Date('2026-07-27T00:00:00.000Z')],
      policy: {
        ...policy,
        sandwichRule: true,
      },
    });
    const service = newLeaveService(prisma);

    await expect(
      apply(service, '2026-07-25', '2026-07-27'),
    ).resolves.toMatchObject({
      days: 2,
    });
  });
});

/**
 * Self-service leave is authorised by the caller's own employee link, not by a module
 * scope. These cover the service half of that contract: the target employee always comes
 * from the token, the record must still be an active employee of the caller's tenant, and
 * a body naming somebody else is refused rather than ignored.
 */
describe('LeaveService: self-service ownership', () => {
  const ACTIVE_EMPLOYEE = {
    id: 'emp-1',
    status: 'CONFIRMED',
    gender: 'MALE',
    employmentType: 'FULL_TIME',
    locationId: 'loc-1',
    probationEndDate: null,
  };

  const managerUser = {
    tenantId: 'tenant-1',
    employeeId: 'emp-1',
    userId: 'user-mgr',
    email: 'manager@example.com',
    name: 'Manager',
    roles: ['Manager'],
    // A Manager holds no leave:write - the employee link is what authorises the apply.
    scopes: ['leave:read', 'leave:approve'],
    isSuperAdmin: false,
  };

  /** Prisma double whose employee lookup honours the id/tenant/status filter. */
  function prismaFor(employee: typeof ACTIVE_EMPLOYEE | null) {
    return {
      employee: { findFirst: jest.fn().mockResolvedValue(employee) },
      leaveType: {
        findFirst: jest.fn().mockResolvedValue({
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
        }),
      },
      leavePolicy: { findFirst: jest.fn().mockResolvedValue(null) },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      shiftAssignment: {
        findFirst: jest.fn().mockResolvedValue({ shift: { id: 'shift-1', weeklyOffDays: [0] } }),
      },
      shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-1', weeklyOffDays: [0] }) },
      leaveBalance: {
        findUnique: jest.fn().mockResolvedValue({ balance: 10 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      leaveRequest: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
  }

  const applyDto = (extra: Record<string, unknown> = {}) => ({
    leaveTypeId: 'lt-1',
    fromDate: '2026-07-27',
    toDate: '2026-07-27',
    reason: 'Medical',
    ...extra,
  });

  it('lets a Manager raise their own leave request without a leave:write scope', async () => {
    const prisma = prismaFor(ACTIVE_EMPLOYEE);
    const service = newLeaveService(prisma);

    await expect(service.apply(managerUser as any, applyDto() as any)).resolves.toMatchObject({
      employeeId: 'emp-1',
      tenantId: 'tenant-1',
    });
    expect(prisma.leaveRequest.create).toHaveBeenCalledTimes(1);
  });

  it('resolves the employee from the token, scoped to the tenant and to active statuses', async () => {
    const prisma = prismaFor(ACTIVE_EMPLOYEE);
    const service = newLeaveService(prisma);

    await service.apply(managerUser as any, applyDto() as any);

    const where = (prisma.employee.findFirst.mock.calls[0][0] as any).where;
    expect(where.id).toBe('emp-1');
    expect(where.tenantId).toBe('tenant-1');
    expect(where.status.in).toEqual(
      expect.arrayContaining(['ACTIVE', 'CONFIRMED', 'ON_PROBATION', 'ON_NOTICE']),
    );
    for (const status of ['EXITED', 'INACTIVE', 'CANDIDATE', 'PREBOARDING', 'ABSCONDING']) {
      expect(where.status.in).not.toContain(status);
    }
  });

  it('refuses a request that names another employee and creates nothing', async () => {
    const prisma = prismaFor(ACTIVE_EMPLOYEE);
    const service = newLeaveService(prisma);

    await expect(
      service.apply(managerUser as any, applyDto({ employeeId: 'emp-2' }) as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
  });

  it('accepts a body that echoes the caller own employee id', async () => {
    const prisma = prismaFor(ACTIVE_EMPLOYEE);
    const service = newLeaveService(prisma);

    await expect(
      service.apply(managerUser as any, applyDto({ employeeId: 'emp-1' }) as any),
    ).resolves.toMatchObject({ employeeId: 'emp-1' });
  });

  it('books the request against the token employee, never the body', async () => {
    const prisma = prismaFor(ACTIVE_EMPLOYEE);
    const service = newLeaveService(prisma);

    await service.apply(managerUser as any, applyDto() as any);

    expect((prisma.leaveRequest.create.mock.calls[0][0] as any).data.employeeId).toBe('emp-1');
  });

  it.each(['apply', 'myRequests', 'cancel'])(
    'refuses a technical account with no employee record on %s',
    async (method) => {
      const prisma = prismaFor(ACTIVE_EMPLOYEE);
      const service = newLeaveService(prisma);
      const serviceAccount = { ...managerUser, roles: ['Developer'], employeeId: null, scopes: [] };

      const call =
        method === 'apply'
          ? service.apply(serviceAccount as any, applyDto() as any)
          : method === 'myRequests'
            ? service.myRequests(serviceAccount as any)
            : service.cancel(serviceAccount as any, 'req-1');

      await expect(call).rejects.toBeInstanceOf(ForbiddenException);
      // Refused on the token alone - the database is never consulted.
      expect(prisma.employee.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each(['apply', 'myRequests', 'myBalances', 'cancel'])(
    'refuses an exited employee whose token still carries the employeeId on %s',
    async (method) => {
      // The status filter matches nothing, which is how an exited or deactivated employee
      // is refused even though their JWT still names them.
      const prisma = prismaFor(null);
      const service = newLeaveService(prisma);

      const call =
        method === 'apply'
          ? service.apply(managerUser as any, applyDto() as any)
          : method === 'myRequests'
            ? service.myRequests(managerUser as any)
            : method === 'myBalances'
              ? service.myBalances(managerUser as any)
              : service.cancel(managerUser as any, 'req-1');

      await expect(call).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
      expect(prisma.leaveRequest.update).not.toHaveBeenCalled();
    },
  );

  it('scopes a cancel to the caller own request', async () => {
    const prisma = prismaFor(ACTIVE_EMPLOYEE);
    const service = newLeaveService(prisma);

    // Another employee's request id reads as not found, not as a forbidden cancel.
    await expect(service.cancel(managerUser as any, 'req-of-emp-2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.leaveRequest.findFirst).toHaveBeenCalledWith({
      where: { id: 'req-of-emp-2', tenantId: 'tenant-1', employeeId: 'emp-1' },
    });
  });

  it('scopes own requests to the caller tenant and employee', async () => {
    const prisma = prismaFor(ACTIVE_EMPLOYEE);
    const service = newLeaveService(prisma);

    await service.myRequests(managerUser as any);

    expect((prisma.leaveRequest.findMany.mock.calls[0][0] as any).where).toEqual({
      tenantId: 'tenant-1',
      employeeId: 'emp-1',
    });
  });

  it('reads own balances for the token employee', async () => {
    const prisma = prismaFor(ACTIVE_EMPLOYEE);
    const service = newLeaveService(prisma);

    await service.myBalances(managerUser as any);

    expect((prisma.leaveBalance.findMany.mock.calls[0][0] as any).where).toMatchObject({
      employee: { tenantId: 'tenant-1' },
      employeeId: 'emp-1',
    });
  });
});
