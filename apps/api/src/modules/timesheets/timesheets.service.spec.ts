import { AuthUser } from '../../common/types/auth-user';
import { TimesheetsService } from './timesheets.service';

describe('TimesheetsService', () => {
  it('computes utilization, billability, budget burn, and billing CSV', async () => {
    const sheet = {
      tenantId: 'tenant-1',
      employeeId: 'emp-1',
      totalHours: 40,
      billableHours: 32,
      weekStart: new Date(),
      employee: {
        id: 'emp-1',
        firstName: 'Riya',
        lastName: 'Sen',
        employeeCode: 'EMP-1',
      },
      projectId: 'project-1',
      project: {
        id: 'project-1',
        name: 'Client Rollout',
        code: 'ACME',
        budgetHours: 100,
        billingRate: 3000,
      },
    };
    const prisma = {
      timesheet: {
        findMany: jest.fn().mockResolvedValue([sheet]),
      },
      employee: {
        count: jest.fn().mockResolvedValue(2),
      },
    };
    const service = new TimesheetsService(prisma as any);

    await expect(service.summary('tenant-1')).resolves.toEqual(
      expect.objectContaining({
        totalHours: 40,
        billableHours: 32,
        nonBillableHours: 8,
        billableRate: 80,
        capacityHours: 320,
        utilizationRate: 13,
      }),
    );
    await expect(service.utilization('tenant-1')).resolves.toEqual({
      employees: [
        expect.objectContaining({
          employee: 'Riya Sen',
          total: 40,
          billable: 32,
          nonBillable: 8,
          utilizationRate: 25,
          billableRate: 80,
        }),
      ],
      projects: [
        expect.objectContaining({
          project: 'Client Rollout',
          budgetBurn: 40,
          revenue: 96000,
        }),
      ],
    });
    await expect(service.billingCsv('tenant-1')).resolves.toContain('Client Rollout,ACME,40,32,8,3000,96000,100,40');
  });

  it('builds payroll sync rows for overtime and hourly workers', async () => {
    const prisma = {
      timesheet: {
        findMany: jest.fn().mockResolvedValue([
          {
            tenantId: 'tenant-1',
            employeeId: 'emp-1',
            totalHours: 44,
            billableHours: 36,
            weekStart: new Date('2026-07-01'),
            employee: {
              id: 'emp-1',
              firstName: 'Riya',
              lastName: 'Sen',
              employeeCode: 'EMP-1',
              employmentType: 'CONTRACTOR',
            },
            project: {
              billingRate: 3500,
              name: 'Client Rollout',
            },
          },
          {
            tenantId: 'tenant-1',
            employeeId: 'emp-2',
            totalHours: 38,
            billableHours: 38,
            weekStart: new Date('2026-07-01'),
            employee: {
              id: 'emp-2',
              firstName: 'Aman',
              lastName: 'Verma',
              employeeCode: 'EMP-2',
              employmentType: 'FULL_TIME',
            },
            project: {
              billingRate: 0,
              name: 'Internal Tooling',
            },
          },
        ]),
      },
    };
    const service = new TimesheetsService(prisma as any);

    await expect(service.payrollSync('tenant-1')).resolves.toEqual(
      expect.objectContaining({
        totalBillableHours: 74,
        totalOvertimeHours: 4,
        hourlyWorkerCount: 1,
        employees: [
          expect.objectContaining({
            employeeCode: 'EMP-1',
            employmentType: 'CONTRACTOR',
            overtimeHours: 4,
            hourlyValue: 126000,
          }),
          expect.objectContaining({
            employeeCode: 'EMP-2',
            overtimeHours: 0,
            hourlyValue: 0,
          }),
        ],
      }),
    );
  });
});

describe('TimesheetsService: decide authorization', () => {
  function user(overrides: Partial<AuthUser> = {}): AuthUser {
    return {
      userId: 'user-1',
      tenantId: 'tenant-1',
      email: 'x@example.com',
      name: 'X',
      isSuperAdmin: false,
      employeeId: 'emp-mgr',
      roles: ['Manager'],
      ...overrides,
    } as AuthUser;
  }

  function prismaFor(ts: Record<string, unknown>) {
    return {
      timesheet: {
        findFirst: jest.fn().mockResolvedValue(ts),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...ts, ...data })),
      },
    };
  }

  const timesheet = (overrides: Record<string, unknown> = {}) => ({
    id: 'ts-1',
    tenantId: 'tenant-1',
    employeeId: 'emp-target',
    status: 'SUBMITTED',
    employee: { managerId: 'emp-mgr' },
    ...overrides,
  });

  it('denies a Manager approving their own timesheet', async () => {
    const prisma = prismaFor(timesheet({ employeeId: 'emp-mgr', employee: { managerId: 'emp-grandmgr' } }));
    const service = new TimesheetsService(prisma as any);

    await expect(service.decide(user(), 'ts-1', 'APPROVED')).rejects.toThrow(
      'You cannot approve your own request.',
    );
    expect(prisma.timesheet.update).not.toHaveBeenCalled();
  });

  it('lets a Manager approve a direct report timesheet', async () => {
    const prisma = prismaFor(timesheet());
    const service = new TimesheetsService(prisma as any);

    await expect(service.decide(user(), 'ts-1', 'APPROVED')).resolves.toMatchObject({ status: 'APPROVED' });
  });

  it('denies a Manager approving a timesheet outside their team', async () => {
    const prisma = prismaFor(timesheet({ employee: { managerId: 'someone-else' } }));
    const service = new TimesheetsService(prisma as any);

    await expect(service.decide(user(), 'ts-1', 'APPROVED')).rejects.toThrow(
      'You can only approve requests from employees who report to you.',
    );
    expect(prisma.timesheet.update).not.toHaveBeenCalled();
  });

  it('lets HR Admin approve any timesheet', async () => {
    const prisma = prismaFor(timesheet({ employee: { managerId: 'someone-else' } }));
    const service = new TimesheetsService(prisma as any);

    await expect(
      service.decide(user({ employeeId: 'emp-hr', roles: ['HR Admin'] }), 'ts-1', 'APPROVED'),
    ).resolves.toMatchObject({ status: 'APPROVED' });
  });
});
