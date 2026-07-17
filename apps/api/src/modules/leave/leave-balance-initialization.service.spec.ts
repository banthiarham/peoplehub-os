import { LeaveBalanceInitializationService } from './leave-balance-initialization.service';

describe('LeaveBalanceInitializationService', () => {
  const year = new Date().getFullYear();

  it.each([
    ['MONTHLY', 1.5, 18, 1.5],
    ['UPFRONT', 0, 12, 12],
    ['YEARLY', 15, null, 15],
  ])(
    'initializes a %s policy with the expected credit',
    async (accrualType, accrualDays, maxAnnualDays, expected) => {
      const prisma = {
        leavePolicy: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'policy-1',
            leaveTypeId: 'type-1',
            accrualType,
            accrualDays,
            maxAnnualDays,
            locationId: null,
            genderRestriction: null,
            employmentTypes: [],
            probationAllowed: true,
            noticePeriodAllowed: true,
          }),
        },
        employee: { findMany: jest.fn().mockResolvedValue([{ id: 'emp-1' }]) },
        leaveBalance: { upsert: jest.fn().mockResolvedValue({}) },
      };
      const service = new LeaveBalanceInitializationService(prisma as any);

      await service.initializeForPolicy('tenant-1', 'policy-1');

      expect(prisma.leaveBalance.upsert).toHaveBeenCalledWith({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: 'emp-1',
            leaveTypeId: 'type-1',
            year,
          },
        },
        create: {
          employeeId: 'emp-1',
          leaveTypeId: 'type-1',
          year,
          openingBalance: expected,
          accrued: expected,
          balance: expected,
        },
        update: {},
      });
    },
  );

  it('initializes a new employee for each applicable active policy only once per leave type', async () => {
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'emp-1',
          status: 'ACTIVE',
          locationId: 'location-1',
          gender: 'FEMALE',
          employmentType: 'FULL_TIME',
        }),
      },
      leavePolicy: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'location-policy',
            leaveTypeId: 'type-1',
            accrualType: 'MONTHLY',
            accrualDays: 2,
            maxAnnualDays: 24,
          },
          {
            id: 'default-policy',
            leaveTypeId: 'type-1',
            accrualType: 'MONTHLY',
            accrualDays: 1,
            maxAnnualDays: 12,
          },
        ]),
      },
      leaveBalance: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const service = new LeaveBalanceInitializationService(prisma as any);

    const initialized = await service.initializeForEmployee('tenant-1', 'emp-1');

    expect(initialized).toBe(1);
    expect(prisma.leaveBalance.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.leaveBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ balance: 2 }),
        update: {},
      }),
    );
  });

  it('does nothing when the policy is inactive or unavailable', async () => {
    const prisma = {
      leavePolicy: { findFirst: jest.fn().mockResolvedValue(null) },
      employee: { findMany: jest.fn() },
      leaveBalance: { upsert: jest.fn() },
    };
    const service = new LeaveBalanceInitializationService(prisma as any);

    expect(await service.initializeForPolicy('tenant-1', 'policy-1')).toBe(0);
    expect(prisma.employee.findMany).not.toHaveBeenCalled();
    expect(prisma.leaveBalance.upsert).not.toHaveBeenCalled();
  });
});
