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
});
