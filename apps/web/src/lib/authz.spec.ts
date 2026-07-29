import { allows, can, hasOnlyCustomRoles, ROLE, viewerFromSession, type Viewer } from './authz';
import { visibleNavSections } from '@/config/nav';

const viewer = (roles: string[], scopes: string[] = [], isSuperAdmin = false): Viewer => ({
  roles,
  scopes,
  isSuperAdmin,
});

const labels = (v: Viewer) => visibleNavSections(v).flatMap((s) => s.items.map((i) => i.label));
const sectionTitles = (v: Viewer) => visibleNavSections(v).map((s) => s.title);

describe('viewerFromSession', () => {
  it('tolerates a missing session and a session issued before scopes existed', () => {
    expect(viewerFromSession(null)).toEqual({ roles: [], scopes: [], isSuperAdmin: false });
    expect(viewerFromSession({ user: { roles: ['HR Admin'] } })).toEqual({
      roles: ['HR Admin'],
      scopes: [],
      isSuperAdmin: false,
    });
  });
});

describe('can', () => {
  it('lets a platform super admin through everything', () => {
    expect(can(viewer([], [], true), { roles: [ROLE.tenantOwner] })).toBe(true);
  });

  it('matches on role or on scope', () => {
    expect(can(viewer(['HR Admin']), { roles: ['HR Admin'] })).toBe(true);
    expect(can(viewer(['Finance Ops'], ['payroll:read']), { scopes: ['payroll:read'] })).toBe(true);
    expect(can(viewer(['Finance Ops']), { roles: ['HR Admin'], scopes: ['payroll:read'] })).toBe(false);
  });

  it('treats an empty requirement as open', () => {
    expect(can(viewer(['Employee']), {})).toBe(true);
  });

  it('gives baseline capabilities to viewers holding only custom roles', () => {
    expect(hasOnlyCustomRoles(viewer(['Finance Ops']))).toBe(true);
    expect(hasOnlyCustomRoles(viewer(['HR Admin', 'Finance Ops']))).toBe(false);
    expect(can(viewer(['Finance Ops']), { roles: ['HR Admin'], baseline: true })).toBe(true);
  });
});

describe('navigation visibility', () => {
  it('shows a Tenant Owner every module', () => {
    const items = labels(viewer([ROLE.tenantOwner]));
    expect(items).toEqual(
      expect.arrayContaining([
        'Dashboard', 'Reports', 'Employees', 'Attendance', 'Leave', 'Onboarding', 'Org Chart',
        'Payroll', 'Tax Engine', 'Recruitment', 'Performance', 'Engagement', 'Helpdesk', 'Assets',
        'Timesheets', 'Documents', 'Setup', 'Communications', 'Developer', 'Settings',
      ]),
    );
    expect(sectionTitles(viewer([ROLE.tenantOwner]))).toHaveLength(6);
  });

  it('hides Payroll, Developer, Setup and Settings from an Employee', () => {
    const items = labels(viewer([ROLE.employee]));
    for (const hidden of ['Payroll', 'Tax Engine', 'Developer', 'Setup', 'Settings', 'Employees', 'Recruitment']) {
      expect(items).not.toContain(hidden);
    }
    // self-service entry points remain
    expect(items).toEqual(expect.arrayContaining(['Dashboard', 'My Portal', 'Helpdesk', 'Documents']));
  });

  it('removes navigation sections that end up empty', () => {
    const titles = sectionTitles(viewer([ROLE.employee]));
    expect(titles).not.toContain('Pay');
    expect(titles).not.toContain('People');
    expect(titles).toEqual(expect.arrayContaining(['Overview', 'Operations', 'Admin']));
    // and no section is ever rendered without items
    expect(visibleNavSections(viewer([ROLE.employee])).every((s) => s.items.length > 0)).toBe(true);
  });

  it('shows a Recruiter recruitment but not payroll or developer', () => {
    const items = labels(viewer([ROLE.recruiter]));
    expect(items).toEqual(expect.arrayContaining(['Recruitment', 'Employees', 'Onboarding', 'Reports']));
    expect(items).not.toContain('Payroll');
    expect(items).not.toContain('Developer');
    expect(items).not.toContain('Settings');
  });

  it('shows a Payroll Admin payroll and tax but not recruitment', () => {
    const items = labels(viewer([ROLE.payrollAdmin]));
    expect(items).toEqual(expect.arrayContaining(['Payroll', 'Tax Engine', 'Setup', 'Settings']));
    expect(items).not.toContain('Recruitment');
    expect(items).not.toContain('Developer');
  });

  it('shows a Finance Admin payroll and timesheets but not setup', () => {
    const items = labels(viewer([ROLE.financeAdmin]));
    expect(items).toEqual(expect.arrayContaining(['Payroll', 'Tax Engine', 'Timesheets', 'Assets', 'Reports']));
    expect(items).not.toContain('Setup');
    expect(items).not.toContain('Developer');
  });

  it('shows a Manager team modules only', () => {
    const items = labels(viewer([ROLE.manager]));
    expect(items).toEqual(expect.arrayContaining(['Employees', 'Attendance', 'Leave', 'Timesheets', 'Performance']));
    expect(items).not.toContain('Payroll');
    expect(items).not.toContain('Settings');
    expect(items).not.toContain('Developer');
  });

  it('shows a Developer the developer console and nothing HR or payroll', () => {
    const items = labels(viewer([ROLE.developer]));
    expect(items).toEqual(expect.arrayContaining(['Developer', 'Settings']));
    for (const hidden of ['Payroll', 'Employees', 'Leave', 'Attendance', 'Recruitment', 'Tax Engine']) {
      expect(items).not.toContain(hidden);
    }
  });

  it('shows an Integration Admin attendance, communications and developer', () => {
    const items = labels(viewer([ROLE.integrationAdmin]));
    expect(items).toEqual(expect.arrayContaining(['Attendance', 'Communications', 'Developer', 'Settings']));
    expect(items).not.toContain('Payroll');
    expect(items).not.toContain('Recruitment');
  });

  it.each([ROLE.auditor, ROLE.leadership])('shows %s read-only business modules', (roleName) => {
    const items = labels(viewer([roleName]));
    expect(items).toEqual(expect.arrayContaining(['Employees', 'Attendance', 'Payroll', 'Reports', 'Recruitment']));
    expect(items).not.toContain('Setup');
  });

  it('gives an Auditor read-only sight of the developer console but no key management', () => {
    // the catalog grants Auditor `developer: VIEW`, which reaches the read-only routes
    const auditor = viewer([ROLE.auditor]);
    expect(labels(auditor)).toContain('Developer');
    expect(allows(auditor, 'developerApiKeys')).toBe(false);
  });

  it('hides the developer console from Leadership', () => {
    expect(labels(viewer([ROLE.leadership]))).not.toContain('Developer');
  });

  it('falls back to the baseline for a viewer holding only custom roles', () => {
    const items = labels(viewer(['Finance Ops']));
    expect(items).toEqual(expect.arrayContaining(['Dashboard', 'My Portal', 'Helpdesk']));
    expect(items).not.toContain('Payroll');
    expect(items).not.toContain('Developer');
  });
});

describe('RBAC configuration gating', () => {
  it('lets HR Admin assign roles but not configure them', () => {
    const hr = viewer([ROLE.hrAdmin]);
    expect(allows(hr, 'manageUserRoles')).toBe(true);
    expect(allows(hr, 'configureRoles')).toBe(false);
  });

  it('lets Tenant Owner do both', () => {
    const owner = viewer([ROLE.tenantOwner]);
    expect(allows(owner, 'manageUserRoles')).toBe(true);
    expect(allows(owner, 'configureRoles')).toBe(true);
  });

  it.each([ROLE.employee, ROLE.recruiter, ROLE.manager, ROLE.payrollAdmin, ROLE.developer])(
    'hides RBAC configuration from %s',
    (roleName) => {
      expect(allows(viewer([roleName]), 'manageUserRoles')).toBe(false);
      expect(allows(viewer([roleName]), 'configureRoles')).toBe(false);
    },
  );
});

describe('action-level gating', () => {
  it('shows payroll lifecycle controls to Payroll Admin and Tenant Owner only', () => {
    expect(allows(viewer([ROLE.payrollAdmin]), 'payrollLifecycle')).toBe(true);
    expect(allows(viewer([ROLE.tenantOwner]), 'payrollLifecycle')).toBe(true);
    for (const roleName of [ROLE.financeAdmin, ROLE.hrAdmin, ROLE.manager, ROLE.employee]) {
      expect(allows(viewer([roleName]), 'payrollLifecycle')).toBe(false);
    }
  });

  it('still lets Finance Admin and HR Admin see payroll itself', () => {
    expect(allows(viewer([ROLE.hrAdmin]), 'payroll')).toBe(true);
    expect(allows(viewer([ROLE.financeAdmin], ['payroll:read']), 'payroll')).toBe(true);
  });

  it('lets a Recruiter manage recruitment but hides approval actions', () => {
    const recruiter = viewer([ROLE.recruiter]);
    expect(allows(recruiter, 'recruitment')).toBe(true);
    expect(allows(recruiter, 'recruitmentManage')).toBe(true);
    expect(allows(recruiter, 'recruitmentApprove')).toBe(false);
  });

  it('keeps recruitment approval for HR Admin, Manager and Tenant Owner', () => {
    for (const roleName of [ROLE.hrAdmin, ROLE.manager, ROLE.tenantOwner]) {
      expect(allows(viewer([roleName]), 'recruitmentApprove')).toBe(true);
    }
  });

  it('hides API key management from Integration Admin', () => {
    const integration = viewer([ROLE.integrationAdmin]);
    expect(allows(integration, 'developer')).toBe(true);
    expect(allows(integration, 'developerApiKeys')).toBe(false);
    expect(allows(viewer([ROLE.developer]), 'developerApiKeys')).toBe(true);
  });
});
