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
    expect(tx.approvalRequest.update).toHaveBeenCalledWith({
      where: { id: 'approval-1' },
      data: expect.objectContaining({ status: 'APPROVED', resolvedAt: expect.any(Date) }),
    });
  });
});
