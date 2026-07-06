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
});
