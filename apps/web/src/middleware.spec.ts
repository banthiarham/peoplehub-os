import { isEmployeeOnlySession, isPortalPath, shouldRedirectToPortal } from './middleware';

describe('isEmployeeOnlySession', () => {
  it('confines a bare Employee to the portal', () => {
    expect(isEmployeeOnlySession(['Employee'], false)).toBe(true);
  });

  it('confines a session with no roles at all (matches the "/" landing redirect)', () => {
    expect(isEmployeeOnlySession([], false)).toBe(true);
  });

  it('does not confine a multi-role user (Employee + Manager)', () => {
    expect(isEmployeeOnlySession(['Employee', 'Manager'], false)).toBe(false);
  });

  it.each(['HR Admin', 'Tenant Owner', 'Payroll Admin', 'Manager', 'Auditor'])(
    'does not confine %s',
    (role) => {
      expect(isEmployeeOnlySession([role], false)).toBe(false);
    },
  );

  it('never confines a super admin, even if roles is empty', () => {
    expect(isEmployeeOnlySession([], true)).toBe(false);
  });
});

describe('isPortalPath', () => {
  it.each(['/me', '/me/', '/me/attendance', '/me/leave', '/me/payslips', '/me/profile', '/me/expenses', '/me/tickets'])(
    '%s is a portal path',
    (path) => {
      expect(isPortalPath(path)).toBe(true);
    },
  );

  it('does not treat a path merely starting with "me" as the portal (no false positive on segment boundary)', () => {
    expect(isPortalPath('/meetings')).toBe(false);
    expect(isPortalPath('/media')).toBe(false);
  });
});

// These are the ACTUAL desktop-app URLs: `(dashboard)` is a Next.js route GROUP, so its
// parens are stripped and every module resolves to its own top-level path, never under
// `/dashboard`. A middleware that only blocked `/dashboard/*` left every one of these open.
const DESKTOP_MODULE_PATHS = [
  '/dashboard',
  '/helpdesk',
  '/attendance',
  '/leave',
  '/payroll',
  '/employees',
  '/employees/emp-123',
  '/reports',
  '/settings',
  '/tax',
  '/performance',
  '/org',
  '/documents',
  '/engagement',
  '/timesheets',
  '/workflows',
  '/communications',
  '/copilot',
  '/setup',
  '/recruitment',
  '/approvals',
  '/assets',
  '/developer',
  '/notifications',
  '/onboarding',
];

describe('shouldRedirectToPortal', () => {
  it.each(DESKTOP_MODULE_PATHS)('Employee-only session -> redirected off %s', (path) => {
    expect(shouldRedirectToPortal(path, ['Employee'], false)).toBe(true);
  });

  it.each(['/me', '/me/attendance', '/me/leave', '/me/payslips', '/me/tickets'])(
    'Employee-only session -> allowed on %s',
    (path) => {
      expect(shouldRedirectToPortal(path, ['Employee'], false)).toBe(false);
    },
  );

  it.each(DESKTOP_MODULE_PATHS)('non-Employee role -> keeps existing access to %s', (path) => {
    expect(shouldRedirectToPortal(path, ['HR Admin'], false)).toBe(false);
    expect(shouldRedirectToPortal(path, ['Tenant Owner'], false)).toBe(false);
    expect(shouldRedirectToPortal(path, ['Payroll Admin'], false)).toBe(false);
    expect(shouldRedirectToPortal(path, ['Manager'], false)).toBe(false);
  });

  it('super admin keeps access to every desktop module regardless of roles array', () => {
    for (const path of DESKTOP_MODULE_PATHS) {
      expect(shouldRedirectToPortal(path, [], true)).toBe(false);
    }
  });
});
