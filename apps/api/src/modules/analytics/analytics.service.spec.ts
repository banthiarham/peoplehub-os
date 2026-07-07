import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  it('builds employee report rows for the generic report builder', async () => {
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([
          {
            employeeCode: 'PH001',
            firstName: 'Asha',
            lastName: 'Shah',
            workEmail: 'asha@example.com',
            status: 'ACTIVE',
            department: { name: 'Engineering' },
            designation: { name: 'Engineer' },
            location: { name: 'Mumbai' },
            manager: { firstName: 'Ravi', lastName: 'Mehta' },
            joiningDate: new Date('2025-04-01'),
          },
        ]),
      },
    };
    const service = new AnalyticsService(prisma as any);

    await expect(service.reportBuilder('tenant-1', 'employees', {})).resolves.toEqual([
      expect.objectContaining({
        employeeCode: 'PH001',
        department: 'Engineering',
        manager: 'Ravi Mehta',
      }),
    ]);
  });

  it('passes analytics filters through to scoped queries', async () => {
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      department: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new AnalyticsService(prisma as any);

    await service.headcountTrend('tenant-1', 6, {
      departmentId: 'dept-1',
      locationId: 'loc-1',
      legalEntityId: 'le-1',
      managerId: 'mgr-1',
      employmentType: 'FULL_TIME',
    });

    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          departmentId: 'dept-1',
          locationId: 'loc-1',
          legalEntityId: 'le-1',
          managerId: 'mgr-1',
          employmentType: 'FULL_TIME',
        }),
      }),
    );
  });
});
