import { AuthUser } from '../../common/types/auth-user';

/**
 * Role-group visibility for `GET /analytics/dashboard`.
 *
 * The dashboard endpoint returns one broad tenant-wide payload. Rather than redesign
 * analytics authorization, this module decides which widget groups a caller may receive
 * and blanks the rest **on the server** before the response is serialised, so unauthorized
 * figures are never sent to the browser.
 *
 * The response SHAPE is intentionally unchanged - blanked groups come back as zeros and
 * empty arrays - so existing clients keep working. `visibleWidgets` is added so the UI can
 * hide a card instead of rendering a zero.
 *
 * Data scoping within a group (a Manager seeing only direct reports) is NOT solved here;
 * a role that cannot be scoped safely receives the group not at all.
 */
export type DashboardWidget =
  | 'headcount'
  | 'attendance'
  | 'approvals'
  | 'payroll'
  | 'payrollReadiness'
  | 'hiring'
  | 'upcoming';

/** Which roles may receive each widget group. */
export const DASHBOARD_WIDGET_ROLES: Record<DashboardWidget, string[]> = {
  headcount: [
    'Super Admin',
    'Tenant Owner',
    'HR Admin',
    'Payroll Admin',
    'Finance Admin',
    'Recruiter',
    'Auditor',
    'Read-only Leadership User',
  ],
  attendance: [
    'Super Admin',
    'Tenant Owner',
    'HR Admin',
    'Payroll Admin',
    'Finance Admin',
    'Auditor',
    'Read-only Leadership User',
    'Integration Admin',
  ],
  approvals: [
    'Super Admin',
    'Tenant Owner',
    'HR Admin',
    'Payroll Admin',
    'Finance Admin',
    'Auditor',
    'Read-only Leadership User',
  ],
  payroll: ['Super Admin', 'Tenant Owner', 'Payroll Admin', 'Finance Admin', 'Auditor', 'Read-only Leadership User'],
  payrollReadiness: ['Super Admin', 'Tenant Owner', 'Payroll Admin', 'Finance Admin', 'Auditor'],
  hiring: ['Super Admin', 'Tenant Owner', 'HR Admin', 'Recruiter', 'Auditor', 'Read-only Leadership User'],
  // Birthdays, work anniversaries and holidays are non-sensitive and stay available to all.
  upcoming: [],
};

const ALL_WIDGETS = Object.keys(DASHBOARD_WIDGET_ROLES) as DashboardWidget[];

/** The widget groups this caller is allowed to receive. */
export function visibleDashboardWidgets(user: Pick<AuthUser, 'roles' | 'isSuperAdmin'>): DashboardWidget[] {
  if (user.isSuperAdmin) return [...ALL_WIDGETS];
  const roles = user.roles ?? [];
  return ALL_WIDGETS.filter((widget) => {
    const allowed = DASHBOARD_WIDGET_ROLES[widget];
    return allowed.length === 0 || allowed.some((role) => roles.includes(role));
  });
}

type DashboardPayload = Awaited<ReturnType<import('./analytics.service').AnalyticsService['dashboard']>>;

/**
 * Blanks every widget group the caller may not see and reports what is left.
 * Never mutates the input.
 */
export function redactDashboard<T extends DashboardPayload>(
  payload: T,
  user: Pick<AuthUser, 'roles' | 'isSuperAdmin'>,
): T & { visibleWidgets: DashboardWidget[] } {
  const visible = visibleDashboardWidgets(user);
  const can = (widget: DashboardWidget) => visible.includes(widget);

  return {
    ...payload,
    headcount: can('headcount')
      ? payload.headcount
      : { total: 0, active: 0, newThisMonth: 0, exitsThisMonth: 0 },
    headcountByDepartment: can('headcount') ? payload.headcountByDepartment : [],
    attendanceToday: can('attendance')
      ? payload.attendanceToday
      : { present: 0, late: 0, absent: 0, notMarked: 0, onLeave: 0, rate: 0 },
    attendanceTrend: can('attendance') ? payload.attendanceTrend : [],
    pendingApprovals: can('approvals')
      ? payload.pendingApprovals
      : { leave: 0, expenses: 0, tickets: 0, total: 0 },
    payroll: can('payroll') ? payload.payroll : { lastRunMonth: null, lastRunNet: 0, trend: [] },
    payrollReadiness: can('payrollReadiness')
      ? payload.payrollReadiness
      : {
          period: null,
          status: 'HIDDEN',
          totalEmployees: 0,
          readyEmployees: 0,
          criticalBlockers: 0,
          warnings: 0,
          readinessRate: 0,
          topIssues: [],
        },
    hiring: can('hiring') ? payload.hiring : { openPositions: 0, activeCandidates: 0, offersPending: 0 },
    upcoming: can('upcoming') ? payload.upcoming : { birthdays: [], anniversaries: [], holidays: [] },
    visibleWidgets: visible,
  };
}
