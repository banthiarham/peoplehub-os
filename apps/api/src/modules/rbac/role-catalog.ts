import { PermissionType, Prisma, ScopeType } from '@prisma/client';
import { scopesForPermissions } from './permission-scopes';

/**
 * Canonical catalog of the system roles every tenant should have available.
 *
 * Production-safety rules that this module guarantees:
 *  - roles are matched by `(tenantId, name)` and are only ever CREATED, never renamed,
 *    re-created or deleted, so existing role IDs and user assignments are preserved;
 *  - permission rows are only ever INSERTED. Reconciliation adds catalog rows that an
 *    existing role is missing and never deletes, rewrites or narrows what is already there.
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

/**
 * NOTE ON SELF-SERVICE LEAVE
 *
 * Applying for your own leave is deliberately NOT a catalog grant. It is authorised by
 * the caller's own employee link (`@SelfService()` on the route, plus an active-employee
 * check in `LeaveService`), not by a `leave` module permission.
 *
 * Granting `leave: CREATE` to every role instead would have handed each of them
 * `leave:write`, and `RolesGuard` matches roles OR scopes - so the scope would have
 * widened access to every other route sharing it, and would have survived any later
 * narrowing of the self-service routes. Employee linkage is the narrower, more honest
 * predicate: it cannot be widened by a permission row and it disappears when the person
 * leaves.
 */

export const SYSTEM_ROLE_CATALOG: CatalogRole[] = [
  {
    name: 'Tenant Owner',
    description: 'Primary workspace administrator with full access across every module',
    grants: [
      grant('organization', FULL, T),
      grant('employees', FULL, T),
      grant('attendance', FULL_APPROVE, T),
      grant('leave', FULL_APPROVE, T),
      grant('payroll', [...FULL_APPROVE, RUN_PAYROLL, LOCK_PAYROLL, UNLOCK_PAYROLL], T),
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
      // The owner must be able to reach the developer/integration console, not only
      // "configure" it: the API-key and integration routes match on their own scopes.
      grant('developer', [VIEW, CONFIGURE, MANAGE_API_KEYS, MANAGE_INTEGRATIONS], T),
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
      // Read-only on purpose. A generic payroll APPROVE grant derives `payroll:approve`,
      // which the payroll run approve/lock/close routes used to accept - that let a
      // Manager approve and lock a tenant-wide payroll run. Expense and loan sign-off
      // stay reachable through the explicit `Manager` role on those routes.
      grant('payroll', [VIEW], R),
      // Requisitions and candidates have no employee to scope by, so DIRECT_REPORTS is
      // not expressible here; hiring managers work across the tenant pipeline.
      // Approval of requisitions and offers is a separate guard, not a catalog grant.
      grant('recruitment', MANAGE_APPROVE, T),
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
      // Integrations only. API-key management is deliberately not granted here.
      grant('developer', [VIEW, MANAGE_INTEGRATIONS], T),
    ],
  },
  {
    name: 'Developer',
    description: 'Manages API keys, OAuth apps and webhooks on the developer platform',
    grants: [
      grant('organization', [VIEW], T),
      grant('employees', [VIEW], T),
      grant('settings', [CONFIGURE], T),
      grant('developer', [VIEW, MANAGE_API_KEYS, MANAGE_INTEGRATIONS], T),
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

/** The scope strings a catalog role grants once its permissions exist. */
export function catalogRoleScopes(roleName: string): string[] {
  const spec = SYSTEM_ROLE_CATALOG.find((role) => role.name === roleName);
  if (!spec) return [];
  return scopesForPermissions(
    spec.grants.flatMap((g) => g.permissionTypes.map((permissionType) => ({ module: g.module, permissionType }))),
  );
}

/**
 * How broad a scope type is. Used only to describe a mismatch in the reconciliation
 * report - it never drives a write.
 */
const SCOPE_BREADTH: Record<ScopeType, number> = {
  [ScopeType.OWN_DATA]: 1,
  [ScopeType.DIRECT_REPORTS]: 2,
  [ScopeType.DEPARTMENT]: 3,
  [ScopeType.LOCATION]: 3,
  [ScopeType.LEGAL_ENTITY]: 3,
  [ScopeType.CUSTOM_GROUP]: 3,
  [ScopeType.ENTIRE_TENANT]: 4,
};

/** A `(module, permissionType)` the role already holds, but at a different scope than the catalog. */
export interface ScopeConflict {
  roleName: string;
  module: string;
  permissionType: PermissionType;
  catalogScope: ScopeType;
  existingScope: ScopeType;
  /** True when what the tenant already has is broader than the catalog default. */
  existingIsWider: boolean;
}

export interface TenantRbacPlan {
  rolesToCreate: string[];
  rolesPresent: string[];
  /** Catalog rows an already-existing system role is missing, keyed by role name. */
  permissionsToAdd: Array<{ roleName: string; roleId: string; rows: Prisma.PermissionCreateManyInput[] }>;
  permissionRowCount: number;
  scopeConflicts: ScopeConflict[];
}

const permissionKey = (module: string, permissionType: PermissionType) => `${module}::${permissionType}`;

/**
 * Works out - without writing anything - what a tenant needs to reach the catalog state.
 *
 * Reconciliation rules, in order of precedence:
 *  1. `(module, permissionType, scopeType)` already present -> nothing to do.
 *  2. `(module, permissionType)` present at a DIFFERENT scope -> reported as a scope
 *     conflict and SKIPPED. Neither the existing row nor the scope is touched, so a
 *     deliberately narrowed or deliberately widened grant survives the backfill.
 *  3. `(module, permissionType)` absent entirely -> queued for insert.
 *
 * Custom (non-catalog) roles are never inspected or modified.
 */
export async function planTenantRbac(
  client: Pick<Prisma.TransactionClient, 'role'>,
  tenantId: string,
): Promise<TenantRbacPlan> {
  const existingRoles = await client.role.findMany({
    where: { tenantId, name: { in: SYSTEM_ROLE_NAMES } },
    select: { id: true, name: true, permissions: { select: { module: true, permissionType: true, scopeType: true } } },
  });
  const byName = new Map(existingRoles.map((role) => [role.name, role]));

  const plan: TenantRbacPlan = {
    rolesToCreate: [],
    rolesPresent: [],
    permissionsToAdd: [],
    permissionRowCount: 0,
    scopeConflicts: [],
  };

  for (const spec of SYSTEM_ROLE_CATALOG) {
    const existing = byName.get(spec.name);
    if (!existing) {
      plan.rolesToCreate.push(spec.name);
      plan.permissionRowCount += spec.grants.reduce((sum, g) => sum + g.permissionTypes.length, 0);
      continue;
    }

    plan.rolesPresent.push(spec.name);

    const exact = new Set(
      existing.permissions.map((p) => `${permissionKey(p.module, p.permissionType)}::${p.scopeType}`),
    );
    const byModuleType = new Map<string, ScopeType>();
    for (const p of existing.permissions) {
      if (!byModuleType.has(permissionKey(p.module, p.permissionType))) {
        byModuleType.set(permissionKey(p.module, p.permissionType), p.scopeType);
      }
    }

    const rows: Prisma.PermissionCreateManyInput[] = [];
    for (const g of spec.grants) {
      for (const permissionType of g.permissionTypes) {
        const key = permissionKey(g.module, permissionType);
        if (exact.has(`${key}::${g.scopeType}`)) continue;

        const existingScope = byModuleType.get(key);
        if (existingScope) {
          plan.scopeConflicts.push({
            roleName: spec.name,
            module: g.module,
            permissionType,
            catalogScope: g.scopeType,
            existingScope,
            existingIsWider: SCOPE_BREADTH[existingScope] > SCOPE_BREADTH[g.scopeType],
          });
          continue;
        }

        rows.push({ roleId: existing.id, module: g.module, permissionType, scopeType: g.scopeType });
      }
    }

    if (rows.length) {
      plan.permissionsToAdd.push({ roleName: spec.name, roleId: existing.id, rows });
      plan.permissionRowCount += rows.length;
    }
  }

  return plan;
}

export interface EnsureTenantRolesResult {
  /** System roles that did not exist and were created with their full catalog grants. */
  created: string[];
  /** System roles that already existed and were topped up, with the row count added. */
  permissionsAdded: Array<{ roleName: string; rows: number }>;
  permissionRowsAdded: number;
  scopeConflicts: ScopeConflict[];
}

/**
 * Idempotently brings a tenant to the catalog state.
 *
 * Purely additive:
 *  - creates system roles the tenant is missing, with their full catalog permissions;
 *  - inserts catalog permission rows that an EXISTING system role does not have yet,
 *    preserving that role's id, its user assignments and any extra permissions it holds;
 *  - never updates, narrows or deletes an existing role or permission;
 *  - never touches custom roles.
 *
 * Safe to call repeatedly: a second call performs zero writes.
 */
export async function ensureTenantRoles(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<EnsureTenantRolesResult> {
  const plan = await planTenantRbac(tx, tenantId);
  const result: EnsureTenantRolesResult = {
    created: [],
    permissionsAdded: [],
    permissionRowsAdded: 0,
    scopeConflicts: plan.scopeConflicts,
  };

  for (const name of plan.rolesToCreate) {
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
    result.created.push(spec.name);
  }

  for (const entry of plan.permissionsToAdd) {
    await tx.permission.createMany({ data: entry.rows, skipDuplicates: true });
    result.permissionsAdded.push({ roleName: entry.roleName, rows: entry.rows.length });
    result.permissionRowsAdded += entry.rows.length;
  }

  return result;
}
