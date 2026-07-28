import { PermissionType, Prisma, ScopeType } from '@prisma/client';

/**
 * Canonical catalog of the system roles every tenant should have available.
 *
 * Production-safety rules that this module guarantees:
 *  - roles are matched by `(tenantId, name)` and are only ever CREATED, never renamed,
 *    re-created or deleted, so existing role IDs and user assignments are preserved;
 *  - default permissions are only written for roles this module actually creates.
 *    A role that already exists keeps its current permissions untouched, so existing
 *    role-to-module access mappings are never modified.
 *
 * `Super Admin` is deliberately NOT part of the catalog: platform-level access is
 * granted through the `users.isSuperAdmin` column, not through an assignable tenant role.
 */

const T = ScopeType.ENTIRE_TENANT;
const O = ScopeType.OWN_DATA;
const R = ScopeType.DIRECT_REPORTS;

const { VIEW, CREATE, EDIT, DELETE, APPROVE, EXPORT, IMPORT, CONFIGURE } = PermissionType;
const { RUN_PAYROLL, LOCK_PAYROLL, UNLOCK_PAYROLL, MANAGE_INTEGRATIONS, MANAGE_API_KEYS } = PermissionType;

const FULL = [VIEW, CREATE, EDIT, DELETE, CONFIGURE];
const FULL_APPROVE = [VIEW, CREATE, EDIT, DELETE, APPROVE, CONFIGURE];
const MANAGE = [VIEW, CREATE, EDIT, DELETE];
const MANAGE_APPROVE = [VIEW, CREATE, EDIT, DELETE, APPROVE];

export interface CatalogGrant {
  module: string;
  permissionTypes: PermissionType[];
  scopeType: ScopeType;
}

export interface CatalogRole {
  name: string;
  description: string;
  grants: CatalogGrant[];
}

const grant = (module: string, permissionTypes: PermissionType[], scopeType: ScopeType): CatalogGrant => ({
  module,
  permissionTypes,
  scopeType,
});

export const SYSTEM_ROLE_CATALOG: CatalogRole[] = [
  {
    name: 'Tenant Owner',
    description: 'Primary workspace administrator with full access across every module',
    grants: [
      grant('organization', FULL, T),
      grant('employees', FULL, T),
      grant('attendance', FULL_APPROVE, T),
      grant('leave', FULL_APPROVE, T),
      grant('payroll', FULL_APPROVE, T),
      grant('recruitment', FULL_APPROVE, T),
      grant('onboarding', FULL_APPROVE, T),
      grant('timesheets', FULL_APPROVE, T),
      grant('assets', FULL, T),
      grant('engagement', FULL, T),
      grant('performance', FULL_APPROVE, T),
      grant('helpdesk', FULL_APPROVE, T),
      grant('documents', FULL, T),
      grant('workflows', FULL_APPROVE, T),
      grant('notifications', FULL, T),
      grant('reports', [VIEW, EXPORT, CONFIGURE], T),
      grant('settings', FULL, T),
      grant('roles', FULL, T),
      grant('tax', FULL, T),
      grant('developer', [CONFIGURE], T),
    ],
  },
  {
    name: 'HR Admin',
    description: 'People operations administrator for employee, attendance, leave and hiring data',
    grants: [
      grant('organization', [VIEW], T),
      grant('employees', [VIEW, CREATE, EDIT, DELETE, EXPORT, IMPORT], T),
      grant('attendance', [VIEW, CREATE, EDIT, DELETE, APPROVE, EXPORT, IMPORT], T),
      grant('leave', MANAGE_APPROVE, T),
      grant('payroll', [VIEW], T),
      grant('recruitment', MANAGE_APPROVE, T),
      grant('onboarding', MANAGE_APPROVE, T),
      grant('timesheets', MANAGE_APPROVE, T),
      grant('assets', MANAGE, T),
      grant('engagement', MANAGE, T),
      grant('performance', MANAGE_APPROVE, T),
      grant('helpdesk', MANAGE_APPROVE, T),
      grant('documents', MANAGE, T),
      grant('workflows', MANAGE_APPROVE, T),
      grant('notifications', MANAGE, T),
      grant('reports', [VIEW, EXPORT], T),
      grant('settings', [VIEW], T),
      grant('roles', [VIEW], T),
      grant('tax', [VIEW], T),
    ],
  },
  {
    name: 'Payroll Admin',
    description: 'Runs and locks payroll, manages statutory and tax configuration',
    grants: [
      grant('organization', [VIEW], T),
      grant('employees', [VIEW, EXPORT], T),
      grant('attendance', [VIEW, EXPORT], T),
      grant('leave', [VIEW], T),
      grant('payroll', [...MANAGE_APPROVE, RUN_PAYROLL, LOCK_PAYROLL, UNLOCK_PAYROLL], T),
      grant('timesheets', [VIEW], T),
      grant('documents', [VIEW], T),
      grant('workflows', MANAGE_APPROVE, T),
      grant('notifications', [VIEW], T),
      grant('reports', [VIEW, EXPORT], T),
      grant('settings', [VIEW], T),
      grant('tax', MANAGE_APPROVE, T),
    ],
  },
  {
    name: 'Finance Admin',
    description: 'Finance oversight for payroll cost, billing, timesheets and reporting',
    grants: [
      grant('organization', [VIEW], T),
      grant('employees', [VIEW], T),
      grant('attendance', [VIEW], T),
      grant('payroll', [VIEW, APPROVE, EXPORT], T),
      grant('timesheets', MANAGE_APPROVE, T),
      grant('assets', [VIEW], T),
      grant('documents', [VIEW], T),
      grant('workflows', [VIEW, APPROVE], T),
      grant('reports', [VIEW, EXPORT], T),
      grant('tax', [VIEW, EXPORT], T),
    ],
  },
  {
    name: 'Recruiter',
    description: 'Manages job requisitions, candidates, interviews and offers',
    grants: [
      grant('organization', [VIEW], T),
      grant('employees', [VIEW], T),
      grant('recruitment', MANAGE, T),
      grant('onboarding', [VIEW, CREATE], T),
      grant('documents', [VIEW], T),
      grant('notifications', [VIEW], T),
      grant('reports', [VIEW], T),
    ],
  },
  {
    name: 'Manager',
    description: 'Team lead with approval rights over their direct reports',
    grants: [
      grant('organization', [VIEW], T),
      grant('employees', [VIEW], R),
      grant('attendance', [VIEW, APPROVE], R),
      grant('leave', [VIEW, APPROVE], R),
      grant('payroll', [APPROVE], R),
      grant('recruitment', MANAGE_APPROVE, R),
      grant('onboarding', [VIEW, EDIT, APPROVE], R),
      grant('timesheets', MANAGE_APPROVE, R),
      grant('assets', [VIEW], R),
      grant('engagement', [VIEW], R),
      grant('performance', [VIEW, CREATE, EDIT, APPROVE], R),
      grant('helpdesk', [VIEW, APPROVE], R),
      grant('documents', [VIEW], R),
      grant('workflows', [APPROVE], R),
      grant('notifications', [VIEW], T),
      grant('reports', [VIEW], R),
    ],
  },
  {
    name: 'Employee',
    description: 'Employee self-service access for attendance, leave, documents, helpdesk and payslips',
    grants: [
      grant('organization', [VIEW], O),
      grant('employees', [VIEW], O),
      grant('attendance', [VIEW, CREATE], O),
      grant('leave', [VIEW, CREATE], O),
      grant('payroll', [VIEW], O),
      grant('onboarding', [VIEW], O),
      grant('timesheets', [VIEW, CREATE], O),
      grant('assets', [VIEW], O),
      grant('engagement', [VIEW, CREATE], O),
      grant('performance', [VIEW, CREATE], O),
      grant('helpdesk', [VIEW, CREATE], O),
      grant('documents', [VIEW], O),
      grant('workflows', [VIEW], O),
      grant('notifications', [VIEW], O),
      grant('tax', [VIEW], O),
    ],
  },
  {
    name: 'Auditor',
    description: 'Read-only access across the workspace for audit and compliance reviews',
    grants: [
      grant('organization', [VIEW], T),
      grant('employees', [VIEW, EXPORT], T),
      grant('attendance', [VIEW, EXPORT], T),
      grant('leave', [VIEW], T),
      grant('payroll', [VIEW, EXPORT], T),
      grant('recruitment', [VIEW], T),
      grant('onboarding', [VIEW], T),
      grant('timesheets', [VIEW], T),
      grant('assets', [VIEW], T),
      grant('engagement', [VIEW], T),
      grant('performance', [VIEW], T),
      grant('helpdesk', [VIEW], T),
      grant('documents', [VIEW], T),
      grant('workflows', [VIEW], T),
      grant('notifications', [VIEW], T),
      grant('reports', [VIEW, EXPORT], T),
      grant('settings', [VIEW], T),
      grant('roles', [VIEW], T),
      grant('tax', [VIEW], T),
      grant('developer', [VIEW], T),
    ],
  },
  {
    name: 'Integration Admin',
    description: 'Manages inbound integrations, device sync and notification delivery',
    grants: [
      grant('organization', [VIEW], T),
      grant('employees', [VIEW], T),
      grant('attendance', [VIEW, IMPORT], T),
      grant('notifications', [VIEW, CONFIGURE], T),
      grant('settings', [CONFIGURE], T),
      grant('developer', [MANAGE_INTEGRATIONS], T),
    ],
  },
  {
    name: 'Developer',
    description: 'Manages API keys, OAuth apps and webhooks on the developer platform',
    grants: [
      grant('organization', [VIEW], T),
      grant('employees', [VIEW], T),
      grant('settings', [CONFIGURE], T),
      grant('developer', [MANAGE_API_KEYS, MANAGE_INTEGRATIONS], T),
    ],
  },
  {
    name: 'Read-only Leadership User',
    description: 'Leadership visibility across the workspace without edit rights',
    grants: [
      grant('organization', [VIEW], T),
      grant('employees', [VIEW], T),
      grant('attendance', [VIEW], T),
      grant('leave', [VIEW], T),
      grant('payroll', [VIEW], T),
      grant('recruitment', [VIEW], T),
      grant('onboarding', [VIEW], T),
      grant('timesheets', [VIEW], T),
      grant('assets', [VIEW], T),
      grant('engagement', [VIEW], T),
      grant('performance', [VIEW], T),
      grant('helpdesk', [VIEW], T),
      grant('documents', [VIEW], T),
      grant('workflows', [VIEW], T),
      grant('notifications', [VIEW], T),
      grant('reports', [VIEW, EXPORT], T),
      grant('tax', [VIEW], T),
    ],
  },
];

export const SYSTEM_ROLE_NAMES = SYSTEM_ROLE_CATALOG.map((role) => role.name);

export const TENANT_OWNER_ROLE = 'Tenant Owner';

/** Flattens a catalog entry into `Permission` rows for a concrete role id. */
export function catalogPermissionRows(role: CatalogRole, roleId: string): Prisma.PermissionCreateManyInput[] {
  return role.grants.flatMap((g) =>
    g.permissionTypes.map((permissionType) => ({
      roleId,
      module: g.module,
      permissionType,
      scopeType: g.scopeType,
    })),
  );
}

/** Names of catalog roles that the tenant does not have yet. */
export async function missingCatalogRoleNames(
  client: Pick<Prisma.TransactionClient, 'role'>,
  tenantId: string,
): Promise<string[]> {
  const existing = await client.role.findMany({ where: { tenantId }, select: { name: true } });
  const existingNames = new Set(existing.map((role) => role.name));
  return SYSTEM_ROLE_NAMES.filter((name) => !existingNames.has(name));
}

/**
 * Idempotently creates any system roles the tenant is missing, together with their
 * default permissions. Roles that already exist are left completely untouched.
 *
 * Safe to call repeatedly: a second call is a no-op.
 */
export async function ensureTenantRoles(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<{ created: string[] }> {
  const missing = await missingCatalogRoleNames(tx, tenantId);
  if (!missing.length) return { created: [] };

  const created: string[] = [];
  for (const name of missing) {
    const spec = SYSTEM_ROLE_CATALOG.find((role) => role.name === name)!;
    // upsert (not create) so a concurrent signup/backfill cannot fail this call.
    const role = await tx.role.upsert({
      where: { tenantId_name: { tenantId, name: spec.name } },
      update: {},
      create: { tenantId, name: spec.name, description: spec.description, isSystem: true },
    });
    const rows = catalogPermissionRows(spec, role.id);
    if (rows.length) {
      await tx.permission.createMany({ data: rows, skipDuplicates: true });
    }
    created.push(spec.name);
  }
  return { created };
}
