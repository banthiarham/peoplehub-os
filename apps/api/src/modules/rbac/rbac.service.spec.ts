import { RbacService } from './rbac.service';

describe('RbacService', () => {
  it('allows built-in sensitive-data roles without additional field grants', async () => {
    const service = new RbacService({ permission: { count: jest.fn() } } as any);

    await expect(
      service.canViewSensitive(
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
          email: 'hr@example.com',
          name: 'HR User',
          employeeId: 'employee-1',
          roles: ['HR Admin'],
          isSuperAdmin: false,
        },
        'taxIds',
      ),
    ).resolves.toBe(true);
  });

  it('uses tenant-scoped field-level grants for custom roles', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const service = new RbacService({ permission: { count } } as any);

    await expect(
      service.canViewSensitive(
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
          email: 'finance-ops@example.com',
          name: 'Finance Ops',
          employeeId: 'employee-1',
          roles: ['Finance Ops'],
          isSuperAdmin: false,
        },
        'bankDetails',
      ),
    ).resolves.toBe(true);

    expect(count).toHaveBeenCalledWith({
      where: {
        module: 'employee.field.bankDetails',
        permissionType: 'VIEW_SENSITIVE',
        role: { tenantId: 'tenant-1', userRoles: { some: { userId: 'user-1' } } },
      },
    });
  });

  it('replaces sensitive field access for only roles in the current tenant', async () => {
    const fieldPermissions = jest
      .spyOn(RbacService.prototype, 'fieldPermissions')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const transaction = jest.fn(async (fn) =>
      fn({
        permission: {
          deleteMany: jest.fn(),
          createMany: jest.fn(),
        },
      }),
    );
    const prisma = {
      role: { findMany: jest.fn().mockResolvedValue([{ id: 'role-1' }]) },
      $transaction: transaction,
      auditLog: { create: jest.fn() },
    };
    const service = new RbacService(prisma as any);

    await service.setFieldPermission('tenant-1', { fieldKey: 'documents', roleIds: ['role-1'] }, 'actor-1');

    const tx = transaction.mock.calls[0][0];
    const permissionTx = {
      permission: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    await tx(permissionTx);
    expect(permissionTx.permission.deleteMany).toHaveBeenCalledWith({
      where: { module: 'employee.field.documents', role: { tenantId: 'tenant-1' } },
    });
    expect(permissionTx.permission.createMany).toHaveBeenCalledWith({
      data: [
        {
          roleId: 'role-1',
          module: 'employee.field.documents',
          permissionType: 'VIEW_SENSITIVE',
          scopeType: 'ENTIRE_TENANT',
        },
      ],
      skipDuplicates: true,
    });

    fieldPermissions.mockRestore();
  });
});
