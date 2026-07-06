import { OnboardingService } from './onboarding.service';

describe('OnboardingService', () => {
  it('starts onboarding from a scoped template with documents, forms, policies, buddy, and welcome tasks', async () => {
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'emp-1',
          tenantId: 'tenant-1',
          departmentId: 'dept-1',
          locationId: 'loc-1',
          employmentType: 'FULL_TIME',
          joiningDate: new Date('2026-08-01'),
        }),
      },
      onboardingTemplate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'tpl-1',
          tenantId: 'tenant-1',
          tasks: [{ title: 'Manager checklist', assignedTo: 'MANAGER', category: 'MANAGER', dueInDays: 1 }],
          documentChecklist: [{ title: 'PAN card upload', assignedTo: 'EMPLOYEE' }],
          joiningForms: [{ title: 'Bank declaration', assignedTo: 'EMPLOYEE' }],
          policyChecklist: [{ title: 'Code of conduct acknowledgement', assignedTo: 'EMPLOYEE' }],
          welcomeEmail: { subject: 'Welcome' },
        }),
      },
      onboardingTask: {
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn().mockResolvedValue({ count: 6 }),
      },
    };
    const service = new OnboardingService(prisma as any);

    await expect(
      service.start('tenant-1', { employeeId: 'emp-1', templateId: 'tpl-1', buddyEmployeeId: 'buddy-1' }),
    ).resolves.toEqual({ created: 6, templateId: 'tpl-1' });
    const createdRows = prisma.onboardingTask.createMany.mock.calls[0][0].data;
    expect(createdRows.map((row: { category: string }) => row.category)).toEqual(
      expect.arrayContaining(['MANAGER', 'DOCUMENT', 'FORM', 'POLICY', 'BUDDY', 'HR']),
    );
  });

  it('blocks exit completion until approvals and mandatory clearance tasks are done or waived', async () => {
    const prisma = {
      exitRequest: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exit-1',
          tenantId: 'tenant-1',
          employeeId: 'emp-1',
          managerApprovalStatus: 'APPROVED',
          hrApprovalStatus: 'APPROVED',
        }),
        update: jest.fn(),
      },
      exitTask: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'task-1', title: 'Recover laptop', isMandatory: true, completedAt: null, isWaived: false },
        ]),
      },
    };
    const service = new OnboardingService(prisma as any);

    await expect(
      service.updateExit('tenant-1', 'exit-1', { status: 'COMPLETED' }, 'user-1'),
    ).rejects.toThrow('Cannot complete exit. Pending mandatory tasks: Recover laptop');
    expect(prisma.exitRequest.update).not.toHaveBeenCalled();
  });
});
