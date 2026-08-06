import { PermissionType } from '@prisma/client';

/**
 * Single source of truth for turning `Permission` rows into the `module:action`
 * scope strings that `@Scopes()` and `RolesGuard` match against.
 *
 * This used to live as private methods on `AuthService`. It is shared now because
 * the role catalog derives Tenant Owner scopes from exactly the same mapping, and
 * because the payroll lifecycle actions must be provably distinct from the generic
 * `payroll:approve` used by expense and loan sign-off.
 */

/** Scope actions that must never be reachable through a generic `approve` grant. */
export const PAYROLL_LIFECYCLE_SCOPES = ['payroll:run', 'payroll:lock', 'payroll:unlock'] as const;

/**
 * Scope actions that gate module-wide configuration (leave types, leave policies, ...)
 * as opposed to acting on a record. `RolesGuard` matches roles OR scopes, so a route
 * that must stay administrative cannot rely on a generic `:write` scope: any role that
 * can create its own record in that module would satisfy it.
 */
export const CONFIGURE_SCOPES = ['leave:configure'] as const;

/**
 * Maps a permission module to its scope namespace.
 *
 * Only `workflows` is renamed: the decorators have always used `workflow:*`.
 */
export function scopeModule(moduleName: string): string {
  return moduleName === 'workflows' ? 'workflow' : moduleName;
}

/**
 * Maps a permission type to the scope actions it grants.
 *
 * Backwards-compatibility notes:
 *  - `RUN_PAYROLL` keeps `write` so a role that only holds it does not lose the
 *    payroll write routes it could already reach; it gains the new `run` action.
 *  - `LOCK_PAYROLL` / `UNLOCK_PAYROLL` previously produced `write` + `approve`.
 *    They now produce only `lock` / `unlock`. This is deliberate: `payroll:approve`
 *    is also granted to Finance Admin and to expense/loan sign-off, so keeping the
 *    lifecycle on it let Finance Admin and Manager lock a payroll run.
 *  - `MANAGE_INTEGRATIONS`, `MANAGE_API_KEYS` and `VIEW_SENSITIVE` previously fell
 *    through to `[]`, which made every Developer and Integration Admin grant inert.
 *  - `CONFIGURE` keeps `write` so nothing that already relied on it loses access, and
 *    additionally derives `configure`. Module-setup routes match on `configure` so that
 *    granting a role `CREATE` (apply for my own leave) does not also hand it the leave
 *    type and policy editors through the shared `:write` scope.
 */
export function scopeActions(permissionType: PermissionType): string[] {
  switch (permissionType) {
    case PermissionType.VIEW:
      return ['read'];
    case PermissionType.CONFIGURE:
      return ['write', 'configure'];
    case PermissionType.CREATE:
    case PermissionType.EDIT:
    case PermissionType.DELETE:
      return ['write'];
    case PermissionType.APPROVE:
      return ['approve'];
    case PermissionType.EXPORT:
      return ['export'];
    case PermissionType.IMPORT:
      return ['import'];
    case PermissionType.RUN_PAYROLL:
      return ['run', 'write'];
    case PermissionType.LOCK_PAYROLL:
      return ['lock'];
    case PermissionType.UNLOCK_PAYROLL:
      return ['unlock'];
    case PermissionType.MANAGE_INTEGRATIONS:
      return ['integrations'];
    case PermissionType.MANAGE_API_KEYS:
      return ['api_keys'];
    case PermissionType.VIEW_SENSITIVE:
      return ['sensitive'];
    default:
      return [];
  }
}

/** Flattens permission rows into a sorted, de-duplicated scope list. */
export function scopesForPermissions(
  permissions: Array<{ module: string; permissionType: PermissionType }>,
): string[] {
  const scopes = new Set<string>();
  for (const permission of permissions) {
    const moduleName = scopeModule(permission.module);
    for (const action of scopeActions(permission.permissionType)) {
      scopes.add(`${moduleName}:${action}`);
    }
  }
  return [...scopes].sort();
}
