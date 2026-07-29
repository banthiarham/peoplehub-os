import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/types/auth-user';
import { RbacService } from './rbac.service';

const actor = (roles: string[], overrides: Partial<AuthUser> = {}): AuthUser => ({
  userId: 'actor-1',
  tenantId: 'tenant-1',
  email: 'actor@example.com',
  name: 'Actor',
  isSuperAdmin: false,
  employeeId: null,
  roles,
  ...overrides,
});

interface AssignMockOptions {
  targetUser?: unknown;
  roles?: Array<{ id: string; name: string }>;
  currentRoles?: Array<{ role: { id: string; name: string } }>;
  remainingOwners?: number;
}

function assignMocks(options: AssignMockOptions = {}) {
  const {
    targetUser = { id: 'user-2', tenantId: 'tenant-1' },
    roles = [{ id: 'role-hr', name: 'HR Admin' }],
    currentRoles = [{ role: { id: 'role-emp', name: 'Employee' } }],
    remainingOwners = 1,
  } = options;

  const tx = {
    userRole: {
      count: jest.fn().mockResolvedValue(remainingOwners),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };
  const prisma = {
    user: { findFirst: jest.fn().mockResolvedValue(targetUser) },
    role: { findMany: jest.fn().mockResolvedValue(roles) },
    userRole: { findMany: jest.fn().mockResolvedValue(currentRoles) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    auditLog: { create: jest.fn() },
  };
  return { prisma, tx, service: new RbacService(prisma as any) };
}

describe('RbacService.assignUserRoles', () => {
  it('rejects an empty role list so a user always keeps at least one role', async () => {
    const { service, prisma } = assignMocks();

    await expect(service.assignUserRoles(actor(['Tenant Owner']), 'user-2', { roleIds: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a user from another tenant', async () => {
    const { service, prisma } = assignMocks({ targetUser: null });

    await expect(
      service.assignUserRoles(actor(['Tenant Owner']), 'user-from-tenant-2', { roleIds: ['role-hr'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { id: 'user-from-tenant-2', tenantId: 'tenant-1' } });
  });

  it('rejects a role that does not belong to the tenant', async () => {
    const { service, prisma } = assignMocks({ roles: [] });

    await expect(
      service.assignUserRoles(actor(['Tenant Owner']), 'user-2', { roleIds: ['role-from-tenant-2'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.role.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', id: { in: ['role-from-tenant-2'] } },
    });
  });

  it('blocks a non-owner from granting Tenant Owner', async () => {
    const { service } = assignMocks({ roles: [{ id: 'role-owner', name: 'Tenant Owner' }] });

    await expect(
      service.assignUserRoles(actor(['HR Admin']), 'user-2', { roleIds: ['role-owner'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks a non-owner from revoking Tenant Owner', async () => {
    const { service } = assignMocks({
      currentRoles: [{ role: { id: 'role-owner', name: 'Tenant Owner' } }],
      roles: [{ id: 'role-hr', name: 'HR Admin' }],
    });

    await expect(
      service.assignUserRoles(actor(['HR Admin']), 'user-2', { roleIds: ['role-hr'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a Tenant Owner to grant Tenant Owner', async () => {
    const { service, tx } = assignMocks({ roles: [{ id: 'role-owner', name: 'Tenant Owner' }] });

    await service.assignUserRoles(actor(['Tenant Owner']), 'user-2', { roleIds: ['role-owner'] });

    expect(tx.userRole.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-2', roleId: 'role-owner' }],
      skipDuplicates: true,
    });
  });

  it('allows a platform super admin to grant Tenant Owner', async () => {
    const { service, tx } = assignMocks({ roles: [{ id: 'role-owner', name: 'Tenant Owner' }] });

    await service.assignUserRoles(actor([], { isSuperAdmin: true }), 'user-2', { roleIds: ['role-owner'] });

    expect(tx.userRole.createMany).toHaveBeenCalled();
  });

  it('blocks a tenant admin from changing roles on a platform super admin account', async () => {
    const { service, prisma } = assignMocks({
      targetUser: { id: 'user-2', tenantId: 'tenant-1', isSuperAdmin: true },
    });

    await expect(
      service.assignUserRoles(actor(['Tenant Owner']), 'user-2', { roleIds: ['role-hr'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows a platform super admin to change roles on a super admin account', async () => {
    const { service, tx } = assignMocks({
      targetUser: { id: 'user-2', tenantId: 'tenant-1', isSuperAdmin: true },
    });

    await service.assignUserRoles(actor([], { isSuperAdmin: true }), 'user-2', { roleIds: ['role-hr'] });

    expect(tx.userRole.createMany).toHaveBeenCalled();
  });

  it('refuses to let a Tenant Owner demote themselves', async () => {
    const { service, prisma } = assignMocks({
      targetUser: { id: 'actor-1', tenantId: 'tenant-1' },
      currentRoles: [{ role: { id: 'role-owner', name: 'Tenant Owner' } }],
      roles: [{ id: 'role-hr', name: 'HR Admin' }],
      remainingOwners: 5,
    });

    await expect(
      service.assignUserRoles(actor(['Tenant Owner']), 'actor-1', { roleIds: ['role-hr'] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('still allows a Tenant Owner to change their own roles when Tenant Owner is retained', async () => {
    const { service, tx } = assignMocks({
      targetUser: { id: 'actor-1', tenantId: 'tenant-1' },
      currentRoles: [{ role: { id: 'role-owner', name: 'Tenant Owner' } }],
      roles: [
        { id: 'role-owner', name: 'Tenant Owner' },
        { id: 'role-hr', name: 'HR Admin' },
      ],
    });

    await service.assignUserRoles(actor(['Tenant Owner']), 'actor-1', {
      roleIds: ['role-owner', 'role-hr'],
    });

    expect(tx.userRole.createMany).toHaveBeenCalled();
  });

  it('refuses to remove the last Tenant Owner of a tenant', async () => {
    const { service, tx } = assignMocks({
      currentRoles: [{ role: { id: 'role-owner', name: 'Tenant Owner' } }],
      roles: [{ id: 'role-hr', name: 'HR Admin' }],
      remainingOwners: 0,
    });

    await expect(
      service.assignUserRoles(actor(['Tenant Owner']), 'user-2', { roleIds: ['role-hr'] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('allows removing a Tenant Owner while another one remains', async () => {
    const { service, tx } = assignMocks({
      currentRoles: [{ role: { id: 'role-owner', name: 'Tenant Owner' } }],
      roles: [{ id: 'role-hr', name: 'HR Admin' }],
      remainingOwners: 1,
    });

    await service.assignUserRoles(actor(['Tenant Owner']), 'user-2', { roleIds: ['role-hr'] });

    expect(tx.userRole.count).toHaveBeenCalledWith({
      where: {
        userId: { not: 'user-2' },
        user: { tenantId: 'tenant-1', isActive: true },
        role: { tenantId: 'tenant-1', name: 'Tenant Owner' },
      },
    });
    expect(tx.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-2' } });
  });

  it('de-duplicates role ids before writing', async () => {
    const { service, tx } = assignMocks({ roles: [{ id: 'role-hr', name: 'HR Admin' }] });

    await service.assignUserRoles(actor(['Tenant Owner']), 'user-2', { roleIds: ['role-hr', 'role-hr'] });

    expect(tx.userRole.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-2', roleId: 'role-hr' }],
      skipDuplicates: true,
    });
  });

  it('audits a successful role change with before, after and reason', async () => {
    const { service, prisma } = assignMocks();

    await service.assignUserRoles(actor(['Tenant Owner']), 'user-2', {
      roleIds: ['role-hr'],
      reason: 'Promoted to HR',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: 'actor-1',
        action: 'user.roles_updated',
        objectType: 'User',
        objectId: 'user-2',
        reason: 'Promoted to HR',
      }),
    });
  });
});

describe('RbacService.updateRole', () => {
  const buildService = (existing: unknown) => {
    const prisma = {
      role: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn(async ({ data }: any) => ({ id: 'role-1', ...data })),
      },
      auditLog: { create: jest.fn() },
    };
    return { prisma, service: new RbacService(prisma as any) };
  };

  it('never writes isSystem, even if a caller smuggles it into the payload', async () => {
    const { prisma, service } = buildService({ id: 'role-1', name: 'Ops Lead', isSystem: false });

    await service.updateRole('tenant-1', 'role-1', { name: 'Ops Manager', isSystem: true } as any, 'actor-1');

    const data = prisma.role.update.mock.calls[0][0].data;
    expect(data).toEqual({ name: 'Ops Manager', description: undefined });
    expect(data).not.toHaveProperty('isSystem');
  });

  it('still refuses to rename a system role', async () => {
    const { prisma, service } = buildService({ id: 'role-1', name: 'HR Admin', isSystem: true });

    await expect(
      service.updateRole('tenant-1', 'role-1', { name: 'Renamed' }, 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.role.update).not.toHaveBeenCalled();
  });
});

describe('RbacService.users', () => {
  it('scopes the listing to the tenant and applies the search filter', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new RbacService({ user: { findMany } } as any);

    await service.users('tenant-1', { q: ' ravi ', limit: 10 });

    const args = findMany.mock.calls[0][0];
    expect(args.where.tenantId).toBe('tenant-1');
    expect(args.take).toBe(10);
    expect(args.where.OR).toEqual(
      expect.arrayContaining([{ email: { contains: 'ravi', mode: 'insensitive' } }]),
    );
  });

  it('applies a bounded default page size when no query is given', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new RbacService({ user: { findMany } } as any);

    await service.users('tenant-1');

    const args = findMany.mock.calls[0][0];
    expect(args.take).toBe(200);
    expect(args.where.OR).toBeUndefined();
  });

  it('clamps an oversized limit', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new RbacService({ user: { findMany } } as any);

    await service.users('tenant-1', { limit: 100000 });

    expect(findMany.mock.calls[0][0].take).toBe(500);
  });
});

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

describe('RbacService.setPermissions', () => {
  const service = (role: unknown) =>
    new RbacService({
      role: { findFirst: jest.fn().mockResolvedValue(role) },
      permission: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
      auditLog: { create: jest.fn() },
    } as never);

  it('rejects a role id from another tenant', async () => {
    await expect(
      service(null).setPermissions('tenant-1', 'role-from-other-tenant', { permissions: [] }, 'actor-1'),
    ).rejects.toThrow('Role not found');
  });

  it('refuses to write sensitive field grants through the generic permission editor', async () => {
    await expect(
      service({ id: 'role-1', tenantId: 'tenant-1', isSystem: false }).setPermissions(
        'tenant-1',
        'role-1',
        {
          permissions: [
            {
              module: 'employee.field.salary',
              permissionType: 'VIEW_SENSITIVE',
              scopeType: 'ENTIRE_TENANT',
            } as never,
          ],
        },
        'actor-1',
      ),
    ).rejects.toThrow('field permissions endpoint');
  });
});
