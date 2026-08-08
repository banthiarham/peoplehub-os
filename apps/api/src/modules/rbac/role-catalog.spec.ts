import { PermissionType, ScopeType } from '@prisma/client';
import {
  SYSTEM_ROLE_CATALOG,
  SYSTEM_ROLE_NAMES,
  catalogPermissionRows,
  catalogRoleScopes,
  ensureTenantRoles,
  missingCatalogRoleNames,
  planTenantRbac,
} from './role-catalog';

type ExistingRole = { id: string; name: string; permissions: Array<{ module: string; permissionType: PermissionType; scopeType: ScopeType }> };

/** Builds an existing role row holding exactly the catalog grants for `name`. */
function fullCatalogRole(name: string): ExistingRole {
  const spec = SYSTEM_ROLE_CATALOG.find((role) => role.name === name)!;
  return {
    id: `role-${name}`,
    name,
    permissions: catalogPermissionRows(spec, `role-${name}`).map((row) => ({
      module: row.module,
      permissionType: row.permissionType as PermissionType,
      scopeType: row.scopeType as ScopeType,
    })),
  };
}

function txMock(existing: Array<string | ExistingRole>) {
  const rows: ExistingRole[] = existing.map((entry) =>
    typeof entry === 'string' ? { id: `role-${entry}`, name: entry, permissions: [] } : entry,
  );
  const created: Array<{ tenantId: string; name: string }> = [];
  const permissionRows: Array<{ roleId: string; module: string; permissionType: PermissionType }> = [];
  const tx = {
    role: {
      findMany: jest.fn().mockResolvedValue(rows),
      upsert: jest.fn(async ({ create }: any) => {
        created.push({ tenantId: create.tenantId, name: create.name });
        return { id: `role-${create.name}`, ...create };
      }),
    },
    permission: {
      createMany: jest.fn(async ({ data }: any) => {
        permissionRows.push(...data);
        return { count: data.length };
      }),
    },
  };
  return { tx, created, permissionRows };
}

const grantsFor = (roleName: string, module: string) =>
  SYSTEM_ROLE_CATALOG.find((r) => r.name === roleName)!.grants.find((g) => g.module === module);

describe('system role catalog: shape', () => {
  it('exposes unique role names and excludes the platform Super Admin', () => {
    expect(new Set(SYSTEM_ROLE_NAMES).size).toBe(SYSTEM_ROLE_NAMES.length);
    expect(SYSTEM_ROLE_NAMES).not.toContain('Super Admin');
    expect(SYSTEM_ROLE_NAMES).toEqual([
      'Tenant Owner',
      'HR Admin',
      'Payroll Admin',
      'Finance Admin',
      'Recruiter',
      'Manager',
      'Employee',
      'Auditor',
      'Integration Admin',
      'Developer',
      'Read-only Leadership User',
    ]);
  });

  it('generates permission rows for every grant in a catalog entry', () => {
    const recruiter = SYSTEM_ROLE_CATALOG.find((r) => r.name === 'Recruiter')!;
    const rows = catalogPermissionRows(recruiter, 'role-1');

    expect(rows.length).toBe(recruiter.grants.reduce((sum, g) => sum + g.permissionTypes.length, 0));
    expect(rows.every((row) => row.roleId === 'role-1')).toBe(true);
    expect(rows).toEqual(
      expect.arrayContaining([
        { roleId: 'role-1', module: 'recruitment', permissionType: 'VIEW', scopeType: 'ENTIRE_TENANT' },
        { roleId: 'role-1', module: 'recruitment', permissionType: 'CREATE', scopeType: 'ENTIRE_TENANT' },
      ]),
    );
  });
});

describe('system role catalog: role behaviour', () => {
  it('gives Tenant Owner tenant-wide access to every business module', () => {
    const owner = SYSTEM_ROLE_CATALOG.find((r) => r.name === 'Tenant Owner')!;
    const modules = owner.grants.map((g) => g.module);

    expect(modules).toEqual(
      expect.arrayContaining([
        'organization', 'employees', 'attendance', 'leave', 'payroll', 'recruitment', 'onboarding',
        'timesheets', 'assets', 'engagement', 'performance', 'helpdesk', 'documents', 'workflows',
        'notifications', 'reports', 'settings', 'roles', 'tax', 'developer',
      ]),
    );
    expect(owner.grants.every((g) => g.scopeType === ScopeType.ENTIRE_TENANT)).toBe(true);
    expect(grantsFor('Tenant Owner', 'payroll')!.permissionTypes).toEqual(
      expect.arrayContaining([PermissionType.RUN_PAYROLL, PermissionType.LOCK_PAYROLL, PermissionType.UNLOCK_PAYROLL]),
    );
  });

  it('lets Recruiter manage recruitment but never approve it', () => {
    const recruitment = grantsFor('Recruiter', 'recruitment')!;
    expect(recruitment.permissionTypes).toEqual(
      expect.arrayContaining([PermissionType.VIEW, PermissionType.CREATE, PermissionType.EDIT, PermissionType.DELETE]),
    );
    expect(recruitment.permissionTypes).not.toContain(PermissionType.APPROVE);
    expect(catalogRoleScopes('Recruiter')).toContain('recruitment:write');
    expect(catalogRoleScopes('Recruiter')).not.toContain('recruitment:approve');
  });

  it.each(['HR Admin', 'Finance Admin', 'Manager'])('gives %s no payroll lifecycle permission', (roleName) => {
    const payroll = grantsFor(roleName, 'payroll');
    for (const type of [PermissionType.RUN_PAYROLL, PermissionType.LOCK_PAYROLL, PermissionType.UNLOCK_PAYROLL]) {
      expect(payroll?.permissionTypes ?? []).not.toContain(type);
    }
    const scopes = catalogRoleScopes(roleName);
    expect(scopes).not.toContain('payroll:run');
    expect(scopes).not.toContain('payroll:lock');
    expect(scopes).not.toContain('payroll:unlock');
  });

  it('gives Manager read-only payroll so a generic approve cannot reach the run lifecycle', () => {
    expect(grantsFor('Manager', 'payroll')!.permissionTypes).toEqual([PermissionType.VIEW]);
    expect(catalogRoleScopes('Manager')).not.toContain('payroll:approve');
  });

  it('keeps leave write and configure off every role that does not administer leave', () => {
    // Self-service leave is authorised by the caller's employee link, not by a catalog
    // grant. If a `leave: CREATE` is ever added here it also derives `leave:write`, which
    // RolesGuard accepts as an alternative to the role list on other leave routes.
    const leaveAdmins = ['Tenant Owner', 'HR Admin'];
    for (const roleName of SYSTEM_ROLE_NAMES.filter((name) => !leaveAdmins.includes(name) && name !== 'Employee')) {
      expect(catalogRoleScopes(roleName)).not.toContain('leave:write');
    }
    expect(catalogRoleScopes('Tenant Owner')).toContain('leave:configure');
    for (const roleName of SYSTEM_ROLE_NAMES.filter((name) => name !== 'Tenant Owner')) {
      expect(catalogRoleScopes(roleName)).not.toContain('leave:configure');
    }
  });

  it('gives Payroll Admin run, lock and unlock', () => {
    const scopes = catalogRoleScopes('Payroll Admin');
    expect(scopes).toEqual(expect.arrayContaining(['payroll:run', 'payroll:lock', 'payroll:unlock']));
  });

  it('scopes Manager to direct reports and Employee to own data', () => {
    const manager = SYSTEM_ROLE_CATALOG.find((r) => r.name === 'Manager')!;
    // recruitment is tenant-wide by design: a requisition has no employee to scope by
    const scoped = manager.grants.filter((g) => !['organization', 'notifications', 'recruitment'].includes(g.module));
    expect(scoped.every((g) => g.scopeType === ScopeType.DIRECT_REPORTS)).toBe(true);

    const employee = SYSTEM_ROLE_CATALOG.find((r) => r.name === 'Employee')!;
    expect(employee.grants.every((g) => g.scopeType === ScopeType.OWN_DATA)).toBe(true);
  });

  it.each(['Auditor', 'Read-only Leadership User'])('keeps %s read-only', (roleName) => {
    const role = SYSTEM_ROLE_CATALOG.find((r) => r.name === roleName)!;
    const mutating = [
      PermissionType.CREATE, PermissionType.EDIT, PermissionType.DELETE, PermissionType.APPROVE,
      PermissionType.CONFIGURE, PermissionType.IMPORT, PermissionType.RUN_PAYROLL,
      PermissionType.LOCK_PAYROLL, PermissionType.UNLOCK_PAYROLL, PermissionType.MANAGE_API_KEYS,
      PermissionType.MANAGE_INTEGRATIONS,
    ];
    for (const grant of role.grants) {
      for (const type of grant.permissionTypes) {
        expect(mutating).not.toContain(type);
      }
    }
    expect(catalogRoleScopes(roleName).every((scope) => /:(read|export)$/.test(scope))).toBe(true);
  });

  it('derives usable developer scopes for Developer and Integration Admin', () => {
    expect(catalogRoleScopes('Developer')).toEqual(
      expect.arrayContaining(['developer:api_keys', 'developer:integrations', 'developer:read']),
    );
    const integration = catalogRoleScopes('Integration Admin');
    expect(integration).toEqual(expect.arrayContaining(['developer:integrations', 'attendance:import']));
    // API key management is deliberately not part of the Integration Admin catalog entry
    expect(integration).not.toContain('developer:api_keys');
  });

  it('gives Integration Admin and Developer no HR or payroll write access', () => {
    for (const roleName of ['Integration Admin', 'Developer']) {
      const scopes = catalogRoleScopes(roleName);
      expect(scopes).not.toContain('payroll:read');
      expect(scopes).not.toContain('employees:write');
      expect(scopes).not.toContain('leave:read');
    }
  });
});

describe('ensureTenantRoles: provisioning and reconciliation', () => {
  it('reports only the catalog roles a tenant is missing', async () => {
    const { tx } = txMock(['Tenant Owner', 'Employee', 'Some Custom Role']);

    await expect(missingCatalogRoleNames(tx as any, 'tenant-1')).resolves.toEqual(
      SYSTEM_ROLE_NAMES.filter((name) => name !== 'Tenant Owner' && name !== 'Employee'),
    );
  });

  it('creates the full catalog for a brand new tenant', async () => {
    const { tx, permissionRows } = txMock([]);

    const result = await ensureTenantRoles(tx as any, 'tenant-new');

    expect(result.created).toEqual(SYSTEM_ROLE_NAMES);
    expect(tx.role.upsert).toHaveBeenCalledTimes(SYSTEM_ROLE_NAMES.length);
    expect(permissionRows.length).toBeGreaterThan(0);
    expect(tx.role.upsert.mock.calls.every(([args]: any) => args.create.isSystem === true)).toBe(true);
    // upsert must never mutate an existing row
    expect(tx.role.upsert.mock.calls.every(([args]: any) => Object.keys(args.update).length === 0)).toBe(true);
  });

  it('creates missing roles and preserves the ids of roles that already exist', async () => {
    const { tx, created } = txMock([fullCatalogRole('Tenant Owner'), fullCatalogRole('Employee')]);

    const result = await ensureTenantRoles(tx as any, 'tenant-1');

    expect(result.created).not.toContain('Tenant Owner');
    expect(result.created).not.toContain('Employee');
    expect(result.created).toContain('Recruiter');
    expect(created.every((role) => role.tenantId === 'tenant-1')).toBe(true);
    // no upsert was issued for a role that already exists, so its id survives
    expect(tx.role.upsert.mock.calls.map(([args]: any) => args.create.name)).not.toContain('Tenant Owner');
  });

  it('adds only the catalog permissions an existing system role is missing', async () => {
    const partialOwner = fullCatalogRole('Tenant Owner');
    const dropped = partialOwner.permissions.filter((p) => p.module === 'recruitment');
    partialOwner.permissions = partialOwner.permissions.filter((p) => p.module !== 'recruitment');
    // an extra, manually added permission that must survive untouched
    partialOwner.permissions.push({
      module: 'custom.module',
      permissionType: PermissionType.VIEW,
      scopeType: ScopeType.ENTIRE_TENANT,
    });

    const { tx, permissionRows } = txMock([partialOwner, ...SYSTEM_ROLE_NAMES.filter((n) => n !== 'Tenant Owner').map(fullCatalogRole)]);

    const result = await ensureTenantRoles(tx as any, 'tenant-1');

    expect(result.created).toEqual([]);
    expect(result.permissionRowsAdded).toBe(dropped.length);
    expect(result.permissionsAdded).toEqual([{ roleName: 'Tenant Owner', rows: dropped.length }]);
    expect(permissionRows.every((row) => row.roleId === 'role-Tenant Owner' && row.module === 'recruitment')).toBe(true);
    expect(tx.permission.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('never touches custom roles', async () => {
    const custom: ExistingRole = { id: 'role-custom', name: 'Finance Ops', permissions: [] };
    const { tx, permissionRows } = txMock([custom, ...SYSTEM_ROLE_NAMES.map(fullCatalogRole)]);

    const result = await ensureTenantRoles(tx as any, 'tenant-1');

    expect(result.created).toEqual([]);
    expect(result.permissionRowsAdded).toBe(0);
    expect(permissionRows.some((row) => row.roleId === 'role-custom')).toBe(false);
  });

  it('reports a wider existing scope without narrowing it', async () => {
    const employee = fullCatalogRole('Employee');
    const target = employee.permissions.find((p) => p.module === 'leave' && p.permissionType === PermissionType.VIEW)!;
    target.scopeType = ScopeType.ENTIRE_TENANT; // deliberately widened by an admin

    const { tx, permissionRows } = txMock([employee, ...SYSTEM_ROLE_NAMES.filter((n) => n !== 'Employee').map(fullCatalogRole)]);

    const result = await ensureTenantRoles(tx as any, 'tenant-1');

    expect(result.scopeConflicts).toEqual([
      {
        roleName: 'Employee',
        module: 'leave',
        permissionType: PermissionType.VIEW,
        catalogScope: ScopeType.OWN_DATA,
        existingScope: ScopeType.ENTIRE_TENANT,
        existingIsWider: true,
      },
    ]);
    // the conflicting row is neither rewritten nor shadowed by a narrower catalog row
    expect(permissionRows).toHaveLength(0);
  });

  it('reports a narrower existing scope without widening it', async () => {
    const hr = fullCatalogRole('HR Admin');
    const target = hr.permissions.find((p) => p.module === 'employees' && p.permissionType === PermissionType.VIEW)!;
    target.scopeType = ScopeType.DEPARTMENT; // deliberately narrowed by an admin

    const { tx, permissionRows } = txMock([hr, ...SYSTEM_ROLE_NAMES.filter((n) => n !== 'HR Admin').map(fullCatalogRole)]);

    const result = await ensureTenantRoles(tx as any, 'tenant-1');

    expect(result.scopeConflicts).toEqual([
      expect.objectContaining({ roleName: 'HR Admin', module: 'employees', existingIsWider: false }),
    ]);
    expect(permissionRows).toHaveLength(0);
  });

  it('is a no-op when the tenant already matches the catalog', async () => {
    const { tx, created, permissionRows } = txMock(SYSTEM_ROLE_NAMES.map(fullCatalogRole));

    const result = await ensureTenantRoles(tx as any, 'tenant-1');

    expect(result).toEqual({ created: [], permissionsAdded: [], permissionRowsAdded: 0, scopeConflicts: [] });
    expect(tx.role.upsert).not.toHaveBeenCalled();
    expect(tx.permission.createMany).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
    expect(permissionRows).toHaveLength(0);
  });

  it('is idempotent: a second run after apply plans no further writes', async () => {
    // first run against an empty tenant
    const first = txMock([]);
    await ensureTenantRoles(first.tx as any, 'tenant-1');

    // second run sees everything the first one created
    const second = txMock(SYSTEM_ROLE_NAMES.map(fullCatalogRole));
    const plan = await planTenantRbac(second.tx as any, 'tenant-1');

    expect(plan.rolesToCreate).toEqual([]);
    expect(plan.permissionRowCount).toBe(0);
    expect(plan.permissionsToAdd).toEqual([]);
    expect(plan.rolesPresent).toEqual(SYSTEM_ROLE_NAMES);
  });

  it('plans without writing anything (dry run support)', async () => {
    const { tx, created, permissionRows } = txMock(['Tenant Owner']);

    const plan = await planTenantRbac(tx as any, 'tenant-1');

    expect(plan.rolesToCreate).toEqual(SYSTEM_ROLE_NAMES.filter((n) => n !== 'Tenant Owner'));
    expect(plan.permissionRowCount).toBeGreaterThan(0);
    expect(tx.role.upsert).not.toHaveBeenCalled();
    expect(tx.permission.createMany).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
    expect(permissionRows).toHaveLength(0);
  });

  it('exposes no destructive operation on the client it is given', async () => {
    const { tx } = txMock([]);
    await ensureTenantRoles(tx as any, 'tenant-1');
    expect((tx.permission as Record<string, unknown>).deleteMany).toBeUndefined();
    expect((tx.role as Record<string, unknown>).delete).toBeUndefined();
    expect((tx.role as Record<string, unknown>).update).toBeUndefined();
  });
});
