import { EmployeesService } from './employees.service';

const user = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  email: 'hr@example.com',
  name: 'HR User',
  isSuperAdmin: false,
  employeeId: 'requester-employee',
  roles: ['HR Admin'],
};

describe('EmployeesService', () => {
  it('routes sensitive profile edits through maker-checker while applying ordinary edits', async () => {
    const existing = {
      id: 'emp-1',
      tenantId: 'tenant-1',
      firstName: 'Asha',
      pan: 'OLDPAN1234',
      status: 'ACTIVE',
    };
    const updated = { ...existing, firstName: 'Asha R' };
    const prisma = {
      employee: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce({ id: 'requester-employee' })
          .mockResolvedValueOnce({ id: 'approver-employee' }),
        update: jest.fn().mockResolvedValue(updated),
      },
      employeeProfileChange: { createMany: jest.fn() },
      approvalRequest: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = new EmployeesService(prisma as any, {} as any);

    const result = await service.update(user, 'emp-1', {
      firstName: 'Asha R',
      pan: 'NEWPAN1234',
    });

    expect(result.pendingSensitiveChanges).toBe(1);
    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: 'emp-1' },
      data: { firstName: 'Asha R' },
    });
    expect(prisma.approvalRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        requesterId: 'requester-employee',
        approverId: 'approver-employee',
        module: 'employees',
        objectType: 'EmployeeProfileChange',
        objectId: 'emp-1',
        requestData: { fields: ['pan'] },
      }),
    });
    expect(prisma.employeeProfileChange.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          employeeId: 'emp-1',
          fieldName: 'pan',
          oldValue: 'OLDPAN1234',
          newValue: 'NEWPAN1234',
          approvedAt: null,
        }),
      ],
    });
  });

  it('lets super admins apply sensitive edits directly', async () => {
    const existing = { id: 'emp-1', tenantId: 'tenant-1', firstName: 'Asha', pan: 'OLDPAN1234', status: 'ACTIVE' };
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue({ ...existing, pan: 'NEWPAN1234' }),
      },
      employeeProfileChange: { createMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = new EmployeesService(prisma as any, {} as any);

    const result = await service.update({ ...user, isSuperAdmin: true, roles: ['Super Admin'] }, 'emp-1', {
      pan: 'NEWPAN1234',
    });

    expect(result.pendingSensitiveChanges).toBe(0);
    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: 'emp-1' },
      data: { pan: 'NEWPAN1234' },
    });
  });

  it('lets tenant owners update legal entity directly while preserving approval for other sensitive fields', async () => {
    const existing = {
      id: 'emp-1',
      tenantId: 'tenant-1',
      legalEntityId: 'entity-1',
      pan: 'OLDPAN1234',
      status: 'ACTIVE',
    };
    const prisma = {
      employee: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce({ id: 'requester-employee' })
          .mockResolvedValueOnce({ id: 'approver-employee' }),
        update: jest.fn().mockResolvedValue({ ...existing, legalEntityId: 'entity-2' }),
      },
      employeeProfileChange: { createMany: jest.fn() },
      approvalRequest: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = new EmployeesService(prisma as any, {} as any);

    const result = await service.update(
      { ...user, roles: ['Tenant Owner'] },
      'emp-1',
      { legalEntityId: 'entity-2', pan: 'NEWPAN1234' },
    );

    expect(result.pendingSensitiveChanges).toBe(1);
    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: 'emp-1' },
      data: { legalEntityId: 'entity-2' },
    });
    expect(prisma.approvalRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ requestData: { fields: ['pan'] } }),
    });
    expect(prisma.employeeProfileChange.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ fieldName: 'pan', approvedAt: null })],
    });
  });
});
