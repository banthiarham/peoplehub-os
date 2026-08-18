/**
 * Shared, framework-free authorization helpers for the web app.
 *
 * The API is and remains the security boundary. Everything here exists so the UI does
 * not render navigation and actions whose every request would come back 403.
 *
 * Two inputs are available on the session:
 *  - `roles`  - always present.
 *  - `scopes` - present from the next sign-in after this release. Older sessions were
 *               issued without it, so every helper must still work when it is missing.
 *               That is why role lists, not scopes, are the primary signal.
 */

export const ROLE = {
  superAdmin: 'Super Admin',
  tenantOwner: 'Tenant Owner',
  hrAdmin: 'HR Admin',
  payrollAdmin: 'Payroll Admin',
  financeAdmin: 'Finance Admin',
  recruiter: 'Recruiter',
  manager: 'Manager',
  employee: 'Employee',
  auditor: 'Auditor',
  integrationAdmin: 'Integration Admin',
  developer: 'Developer',
  leadership: 'Read-only Leadership User',
} as const;

/** Mirrors SYSTEM_ROLE_CATALOG on the API, plus the platform Super Admin name. */
export const SYSTEM_ROLES: string[] = Object.values(ROLE);

export interface Viewer {
  roles: string[];
  scopes: string[];
  isSuperAdmin: boolean;
}

type SessionLike = {
  user?: { roles?: string[] | null; scopes?: string[] | null; isSuperAdmin?: boolean | null } | null;
} | null;

export function viewerFromSession(session: SessionLike): Viewer {
  return {
    roles: session?.user?.roles ?? [],
    scopes: session?.user?.scopes ?? [],
    isSuperAdmin: session?.user?.isSuperAdmin ?? false,
  };
}

/** True when the viewer holds at least one of `roles`. */
export function hasRole(viewer: Viewer, ...roles: string[]): boolean {
  if (viewer.isSuperAdmin) return true;
  return roles.some((role) => viewer.roles.includes(role));
}

/**
 * True when the viewer's token carries `scope`.
 *
 * Returns false for sessions issued before scopes were propagated, so this is only ever
 * used to WIDEN a role check, never to narrow one.
 */
export function hasScope(viewer: Viewer, scope: string): boolean {
  if (viewer.isSuperAdmin) return true;
  return viewer.scopes.includes(scope);
}

/**
 * True when the viewer holds none of the system roles - i.e. only tenant-defined custom
 * roles. Their real permissions live in permission rows the session cannot see, so the UI
 * shows them the self-service baseline and lets the API decide the rest.
 */
export function hasOnlyCustomRoles(viewer: Viewer): boolean {
  if (viewer.isSuperAdmin) return false;
  return viewer.roles.length > 0 && !viewer.roles.some((role) => SYSTEM_ROLES.includes(role));
}

/** A capability gate: allowed when any listed role matches, or any listed scope is held. */
export interface Requirement {
  roles?: string[];
  scopes?: string[];
  /** Visible to viewers holding only custom roles. Defaults to false. */
  baseline?: boolean;
}

export function can(viewer: Viewer, requirement: Requirement): boolean {
  if (viewer.isSuperAdmin) return true;
  if (!requirement.roles?.length && !requirement.scopes?.length) return true;
  if (requirement.roles?.length && hasRole(viewer, ...requirement.roles)) return true;
  if (requirement.scopes?.some((scope) => hasScope(viewer, scope))) return true;
  if (requirement.baseline && hasOnlyCustomRoles(viewer)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Named capabilities. Keep these mirrored with the API guards they describe.
// ---------------------------------------------------------------------------

const READ_ALL = [
  ROLE.tenantOwner,
  ROLE.hrAdmin,
  ROLE.payrollAdmin,
  ROLE.financeAdmin,
  ROLE.auditor,
  ROLE.leadership,
];

export const CAPABILITY = {
  /** RBAC_ADMIN_ROLES on the API: read RBAC data and assign roles. */
  manageUserRoles: { roles: [ROLE.tenantOwner, ROLE.hrAdmin] },
  /** RBAC_CONFIG_ROLES on the API: custom roles, role permissions, sensitive fields. */
  configureRoles: { roles: [ROLE.tenantOwner] },

  /**
   * Can open the payroll module at all. Wider than PAYROLL_ROLES because Finance Admin,
   * Auditor and Leadership hold `payroll: VIEW` in the catalog and reach the read routes
   * through `payroll:read`.
   */
  payroll: {
    roles: [ROLE.tenantOwner, ROLE.payrollAdmin, ROLE.hrAdmin, ROLE.financeAdmin, ROLE.auditor, ROLE.leadership],
    scopes: ['payroll:read'],
  },
  /** PAYROLL_LIFECYCLE_ROLES: process, approve, lock, close, override warnings. */
  payrollLifecycle: {
    roles: [ROLE.tenantOwner, ROLE.payrollAdmin],
    scopes: ['payroll:run', 'payroll:lock'],
  },

  /** RECRUITMENT_MANAGE_ROLES. */
  recruitment: {
    roles: [ROLE.tenantOwner, ROLE.hrAdmin, ROLE.recruiter, ROLE.manager, ROLE.auditor, ROLE.leadership],
    scopes: ['recruitment:read'],
  },
  recruitmentManage: {
    roles: [ROLE.tenantOwner, ROLE.hrAdmin, ROLE.recruiter, ROLE.manager],
    scopes: ['recruitment:write'],
  },
  /** RECRUITMENT_APPROVAL_ROLES - Recruiter excluded on purpose. */
  recruitmentApprove: {
    roles: [ROLE.tenantOwner, ROLE.hrAdmin, ROLE.manager],
    scopes: ['recruitment:approve'],
  },

  /** DEVELOPER_ROLES on the API. */
  developer: {
    roles: [ROLE.tenantOwner, ROLE.developer, ROLE.integrationAdmin, ROLE.auditor],
    scopes: ['developer:read'],
  },
  developerApiKeys: { roles: [ROLE.tenantOwner, ROLE.developer], scopes: ['developer:api_keys'] },

  setup: { roles: [ROLE.tenantOwner, ROLE.hrAdmin, ROLE.payrollAdmin] },
  settings: { roles: [ROLE.tenantOwner, ROLE.hrAdmin, ROLE.payrollAdmin, ROLE.auditor, ROLE.integrationAdmin, ROLE.developer] },
  employees: { roles: [...READ_ALL, ROLE.recruiter, ROLE.manager], scopes: ['employees:read'] },
  /** Mirrors the @Roles guard on POST /employees/:id/terminate. Deliberately narrow. */
  terminateEmployee: { roles: [ROLE.tenantOwner, ROLE.hrAdmin] },
  attendance: { roles: [...READ_ALL, ROLE.manager, ROLE.integrationAdmin], scopes: ['attendance:read'] },
  leave: { roles: [...READ_ALL, ROLE.manager], scopes: ['leave:read'] },
  onboarding: { roles: [...READ_ALL, ROLE.recruiter, ROLE.manager] },
  performance: { roles: [ROLE.tenantOwner, ROLE.hrAdmin, ROLE.manager, ROLE.auditor, ROLE.leadership] },
  engagement: { roles: [...READ_ALL, ROLE.manager, ROLE.recruiter] },
  timesheets: { roles: [...READ_ALL, ROLE.manager] },
  assets: { roles: [ROLE.tenantOwner, ROLE.hrAdmin, ROLE.financeAdmin, ROLE.manager, ROLE.auditor, ROLE.leadership] },
  tax: { roles: [ROLE.tenantOwner, ROLE.hrAdmin, ROLE.payrollAdmin, ROLE.financeAdmin, ROLE.auditor, ROLE.leadership] },
  reports: { roles: [...READ_ALL, ROLE.recruiter], scopes: ['reports:read'] },
  organization: { roles: [...READ_ALL, ROLE.recruiter, ROLE.manager], scopes: ['organization:read'] },
  communications: { roles: [ROLE.tenantOwner, ROLE.hrAdmin, ROLE.integrationAdmin] },

  /** Available to everyone with a session, including custom-role-only viewers. */
  selfService: { baseline: true },
} satisfies Record<string, Requirement>;

export type CapabilityName = keyof typeof CAPABILITY;

export function allows(viewer: Viewer, capability: CapabilityName): boolean {
  return can(viewer, CAPABILITY[capability]);
}
