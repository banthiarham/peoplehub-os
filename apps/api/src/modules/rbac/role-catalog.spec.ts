import {
  SYSTEM_ROLE_CATALOG,
  SYSTEM_ROLE_NAMES,
  catalogPermissionRows,
  ensureTenantRoles,
  missingCatalogRoleNames,
} from './role-catalog';

function txMock(existingNames: string[]) {
  const created: Array<{ tenantId: string; name: string }> = [];
  const permissionRows: unknown[] = [];
  const tx = {
    role: {
      findMany: jest.fn().mockResolvedValue(existingNames.map((name) => ({ name }))),
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

describe('system role catalog', () => {
  it('exposes unique role names and excludes Super Admin', () => {
    expect(new Set(SYSTEM_ROLE_NAMES).size).toBe(SYSTEM_ROLE_NAMES.length);
    expect(SYSTEM_ROLE_NAMES).not.toContain('Super Admin');
    expect(SYSTEM_ROLE_NAMES).toEqual(
      expect.arrayContaining(['Tenant Owner', 'HR Admin', 'Payroll Admin', 'Recruiter', 'Manager', 'Employee']),
    );
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

  it('reports only the catalog roles a tenant is missing', async () => {
    const { tx } = txMock(['Tenant Owner', 'Employee', 'Some Custom Role']);

    await expect(missingCatalogRoleNames(tx as any, 'tenant-1')).resolves.toEqual(
      SYSTEM_ROLE_NAMES.filter((name) => name !== 'Tenant Owner' && name !== 'Employee'),
    );
  });

  it('creates missing roles and leaves existing roles untouched', async () => {
    const { tx, created, permissionRows } = txMock(['Tenant Owner', 'Employee']);

    const { created: createdNames } = await ensureTenantRoles(tx as any, 'tenant-1');

    expect(createdNames).not.toContain('Tenant Owner');
    expect(createdNames).not.toContain('Employee');
    expect(createdNames).toContain('Recruiter');
    expect(created.every((role) => role.tenantId === 'tenant-1')).toBe(true);

    // Existing roles must not have permissions written for them.
    expect(permissionRows).not.toEqual(expect.arrayContaining([expect.objectContaining({ roleId: 'role-Tenant Owner' })]));
    // No destructive operation is available on the transaction client we were given.
    expect((tx.permission as Record<string, unknown>).deleteMany).toBeUndefined();
  });

  it('is a no-op when the tenant already has the full catalog', async () => {
    const { tx, created, permissionRows } = txMock([...SYSTEM_ROLE_NAMES]);

    await expect(ensureTenantRoles(tx as any, 'tenant-1')).resolves.toEqual({ created: [] });

    expect(tx.role.upsert).not.toHaveBeenCalled();
    expect(tx.permission.createMany).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
    expect(permissionRows).toHaveLength(0);
  });

  it('creates the full catalog for a brand new tenant', async () => {
    const { tx, permissionRows } = txMock([]);

    const result = await ensureTenantRoles(tx as any, 'tenant-new');

    expect(result.created).toEqual(SYSTEM_ROLE_NAMES);
    expect(tx.role.upsert).toHaveBeenCalledTimes(SYSTEM_ROLE_NAMES.length);
    expect(permissionRows.length).toBeGreaterThan(0);
    // every catalog role is created with isSystem so it is protected from renames
    expect(tx.role.upsert.mock.calls.every(([args]: any) => args.create.isSystem === true)).toBe(true);
    // upsert must never mutate an existing row
    expect(tx.role.upsert.mock.calls.every(([args]: any) => Object.keys(args.update).length === 0)).toBe(true);
  });
});
