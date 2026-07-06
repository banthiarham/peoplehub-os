import { WorkflowsService } from './workflows.service';

const approver = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  email: 'hr@example.com',
  name: 'HR Admin',
  isSuperAdmin: false,
  employeeId: 'approver-employee',
  roles: ['HR Admin'],
};

describe('WorkflowsService', () => {
  it('applies attendance regularization when the approval is approved', async () => {
    const request = {
      id: 'approval-1',
      tenantId: 'tenant-1',
      requesterId: 'emp-1',
      module: 'attendance',
      objectType: 'AttendanceRegularization',
      objectId: 'emp-1:2026-07-05',
      currentStep: 1,
      status: 'PENDING',
      comments: [],
      requestData: {
        punchIn: '2026-07-05T09:00:00.000Z',
        punchOut: '2026-07-05T18:00:00.000Z',
        reason: 'Client visit',
      },
    };
    const tx = {
      attendanceRecord: { upsert: jest.fn() },
      approvalRequestHistory: { create: jest.fn() },
      approvalRequest: { update: jest.fn().mockResolvedValue({ ...request, status: 'APPROVED' }) },
    };
    const prisma = {
      approvalRequest: { findFirst: jest.fn().mockResolvedValue(request) },
      $transaction: jest.fn((fn) => fn(tx)),
    };
    const service = new WorkflowsService(prisma as any);

    await service.decide(approver, 'approval-1', 'APPROVED', 'Approved');

    expect(tx.attendanceRecord.upsert).toHaveBeenCalledWith({
      where: { employeeId_date: { employeeId: 'emp-1', date: new Date('2026-07-05T00:00:00.000Z') } },
      create: expect.objectContaining({
        tenantId: 'tenant-1',
        employeeId: 'emp-1',
        status: 'PRESENT',
        workingMinutes: 540,
        punchSource: 'MANUAL',
      }),
      update: expect.objectContaining({
        status: 'PRESENT',
        workingMinutes: 540,
        punchSource: 'MANUAL',
      }),
    });
    expect(tx.approvalRequestHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          approvalRequestId: 'approval-1',
          action: 'COMPLETED',
        }),
      }),
    );
    expect(tx.approvalRequest.update).toHaveBeenCalledWith({
      where: { id: 'approval-1' },
      data: expect.objectContaining({ status: 'APPROVED', resolvedAt: expect.any(Date) }),
    });
  });

  it('advances multi-level approvals to the next approver and records history', async () => {
    const request = {
      id: 'approval-2',
      tenantId: 'tenant-1',
      requesterId: 'emp-1',
      module: 'expenses',
      objectType: 'ExpenseClaim',
      objectId: 'exp-1',
      currentStep: 1,
      status: 'PENDING',
      comments: [],
      requestData: { title: 'Team dinner' },
      workflow: {
        id: 'workflow-1',
        steps2: [
          { stepNumber: 1, approverType: 'REPORTING_MANAGER', approverValue: null, slaHours: 24, autoApprove: false },
          { stepNumber: 2, approverType: 'HR_ADMIN', approverValue: null, slaHours: 48, autoApprove: false },
        ],
      },
    };
    const tx = {
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'emp-1',
          managerId: 'manager-1',
          department: { headId: null },
        }),
        findFirst: jest.fn().mockResolvedValue({ id: 'hr-1' }),
      },
      workflowStep: { findFirst: jest.fn().mockResolvedValue(request.workflow.steps2[1]) },
      approvalRequestHistory: { create: jest.fn() },
      approvalRequest: {
        update: jest.fn().mockResolvedValue({ ...request, currentStep: 2, status: 'PENDING', approverId: 'hr-1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...request, currentStep: 2, status: 'PENDING', approverId: 'hr-1' }),
      },
    };
    const prisma = {
      approvalRequest: { findFirst: jest.fn().mockResolvedValue(request) },
      $transaction: jest.fn((fn) => fn(tx)),
    };
    const service = new WorkflowsService(prisma as any);

    await service.decide(approver, 'approval-2', 'APPROVED', 'Approved manager step');

    expect(tx.approvalRequestHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'APPROVED',
          stepNumber: 1,
        }),
      }),
    );
    expect(tx.approvalRequest.update).toHaveBeenCalledWith({
      where: { id: 'approval-2' },
      data: expect.objectContaining({
        currentStep: 2,
        approverId: 'hr-1',
        status: 'PENDING',
      }),
    });
  });

  it('escalates overdue approvals after SLA breach', async () => {
    const request = {
      id: 'approval-3',
      tenantId: 'tenant-1',
      currentStep: 1,
      status: 'PENDING',
      dueAt: new Date('2026-07-05T08:00:00.000Z'),
      comments: [],
    };
    const tx = {
      approvalRequestHistory: { create: jest.fn() },
      approvalRequest: { update: jest.fn().mockResolvedValue({ ...request, status: 'ESCALATED' }) },
    };
    const prisma = {
      approvalRequest: {
        findMany: jest.fn().mockResolvedValue([request]),
      },
      $transaction: jest.fn((fn) => fn(tx)),
    };
    const service = new WorkflowsService(prisma as any);

    await expect(service.runEscalations('tenant-1')).resolves.toEqual({ escalated: 1 });

    expect(tx.approvalRequestHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ESCALATED',
          stepNumber: 1,
          status: 'ESCALATED',
        }),
      }),
    );
    expect(tx.approvalRequest.update).toHaveBeenCalledWith({
      where: { id: 'approval-3' },
      data: expect.objectContaining({ status: 'ESCALATED' }),
    });
  });
});
