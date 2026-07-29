import { redactDashboard, visibleDashboardWidgets } from './dashboard-visibility';

const payload = {
  headcount: { total: 120, active: 110, newThisMonth: 5, exitsThisMonth: 2 },
  attendanceToday: { present: 90, late: 4, absent: 3, notMarked: 8, onLeave: 5, rate: 86.4 },
  attendanceTrend: [{ month: '2026-06', rate: 94.1 }],
  pendingApprovals: { leave: 7, expenses: 3, tickets: 2, total: 12 },
  payroll: { lastRunMonth: '2026-06', lastRunNet: 8450000, trend: [{ month: '2026-06', amount: 8450000, gross: 9900000 }] },
  payrollReadiness: {
    period: '2026-06',
    status: 'LOCKED',
    totalEmployees: 110,
    readyEmployees: 108,
    criticalBlockers: 0,
    warnings: 2,
    readinessRate: 98,
    topIssues: [{ label: 'Leave approvals pending before payroll', count: 7, severity: 'warning' as const }],
  },
  hiring: { openPositions: 6, activeCandidates: 41, offersPending: 3 },
  headcountByDepartment: [{ name: 'Engineering', value: 48 }],
  upcoming: {
    birthdays: [{ id: 'e1', name: 'A B', date: new Date('2026-08-02') }],
    anniversaries: [],
    holidays: [{ name: 'Independence Day', date: new Date('2026-08-15') }],
  },
};

type Redacted = typeof payload & { visibleWidgets: string[] };

const viewer = (roles: string[], isSuperAdmin = false) => ({ roles, isSuperAdmin });

/** `redactDashboard` is typed against the real service return; the fixture is structural. */
const redact = (roles: string[], isSuperAdmin = false) =>
  redactDashboard(payload as never, viewer(roles, isSuperAdmin)) as unknown as Redacted;

describe('dashboard widget visibility', () => {
  it('gives a Tenant Owner every widget group', () => {
    expect(visibleDashboardWidgets(viewer(['Tenant Owner']))).toEqual([
      'headcount', 'attendance', 'approvals', 'payroll', 'payrollReadiness', 'hiring', 'upcoming',
    ]);
  });

  it('gives a platform super admin every widget group without a tenant role', () => {
    expect(visibleDashboardWidgets(viewer([], true))).toHaveLength(7);
  });

  it('gives HR Admin workforce widgets but no payroll figures', () => {
    const widgets = visibleDashboardWidgets(viewer(['HR Admin']));
    expect(widgets).toEqual(expect.arrayContaining(['headcount', 'attendance', 'approvals', 'hiring']));
    expect(widgets).not.toContain('payroll');
    expect(widgets).not.toContain('payrollReadiness');
  });

  it('gives Payroll Admin payroll widgets', () => {
    expect(visibleDashboardWidgets(viewer(['Payroll Admin']))).toEqual(
      expect.arrayContaining(['payroll', 'payrollReadiness', 'attendance', 'approvals']),
    );
  });

  it('gives Finance Admin financial summaries but not hiring', () => {
    const widgets = visibleDashboardWidgets(viewer(['Finance Admin']));
    expect(widgets).toEqual(expect.arrayContaining(['payroll', 'payrollReadiness']));
    expect(widgets).not.toContain('hiring');
  });

  it('gives Recruiter hiring and headcount only', () => {
    const widgets = visibleDashboardWidgets(viewer(['Recruiter']));
    expect(widgets).toEqual(['headcount', 'hiring', 'upcoming']);
  });

  it('gives Integration Admin operational attendance only', () => {
    expect(visibleDashboardWidgets(viewer(['Integration Admin']))).toEqual(['attendance', 'upcoming']);
  });

  it.each(['Employee', 'Manager', 'Developer'])('gives %s no tenant-wide business widgets', (role) => {
    expect(visibleDashboardWidgets(viewer([role]))).toEqual(['upcoming']);
  });

  it('gives Auditor and Leadership read-only summaries', () => {
    expect(visibleDashboardWidgets(viewer(['Auditor']))).toEqual(
      expect.arrayContaining(['headcount', 'attendance', 'approvals', 'payroll', 'hiring']),
    );
    const leadership = visibleDashboardWidgets(viewer(['Read-only Leadership User']));
    expect(leadership).toEqual(expect.arrayContaining(['headcount', 'payroll', 'hiring']));
    expect(leadership).not.toContain('payrollReadiness');
  });

  it('treats a custom-role-only viewer as having no business widgets', () => {
    expect(visibleDashboardWidgets(viewer(['Finance Ops']))).toEqual(['upcoming']);
  });
});

describe('redactDashboard', () => {
  it('does not send payroll or recruitment figures to an Employee', () => {
    const result = redact(['Employee']);

    expect(result.payroll).toEqual({ lastRunMonth: null, lastRunNet: 0, trend: [] });
    expect(result.payrollReadiness.topIssues).toEqual([]);
    expect(result.payrollReadiness.status).toBe('HIDDEN');
    expect(result.hiring).toEqual({ openPositions: 0, activeCandidates: 0, offersPending: 0 });
    expect(result.headcount).toEqual({ total: 0, active: 0, newThisMonth: 0, exitsThisMonth: 0 });
    expect(result.headcountByDepartment).toEqual([]);
    expect(result.pendingApprovals.total).toBe(0);
    expect(result.attendanceTrend).toEqual([]);
    // non-sensitive people calendar is still available
    expect(result.upcoming.holidays).toHaveLength(1);
    expect(result.visibleWidgets).toEqual(['upcoming']);
  });

  it('does not send HR or payroll business data to a Developer', () => {
    const result = redact(['Developer']);

    expect(result.headcount.active).toBe(0);
    expect(result.payroll.lastRunNet).toBe(0);
    expect(result.hiring.activeCandidates).toBe(0);
    expect(result.attendanceToday.present).toBe(0);
  });

  it('passes everything through for a Tenant Owner', () => {
    const result = redact(['Tenant Owner']);

    expect(result.payroll.lastRunNet).toBe(8450000);
    expect(result.hiring.activeCandidates).toBe(41);
    expect(result.headcount.active).toBe(110);
    expect(result.visibleWidgets).toHaveLength(7);
  });

  it('gives Recruiter hiring figures but blanks payroll', () => {
    const result = redact(['Recruiter']);

    expect(result.hiring.activeCandidates).toBe(41);
    expect(result.headcount.active).toBe(110);
    expect(result.payroll.lastRunNet).toBe(0);
    expect(result.pendingApprovals.total).toBe(0);
  });

  it('never mutates the source payload', () => {
    const before = JSON.stringify(payload);
    redact(['Employee']);
    expect(JSON.stringify(payload)).toBe(before);
  });
});
