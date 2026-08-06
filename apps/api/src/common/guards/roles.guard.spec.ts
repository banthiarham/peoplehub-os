import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AuthUser } from '../types/auth-user';
import { SYSTEM_ROLE_NAMES, catalogRoleScopes } from '../../modules/rbac/role-catalog';
import { AnalyticsController } from '../../modules/analytics/analytics.controller';
import { AssetsController } from '../../modules/assets/assets.controller';
import { DeveloperController } from '../../modules/developer/developer.controller';
import { EngagementController } from '../../modules/engagement/engagement.controller';
import { LeaveController } from '../../modules/leave/leave.controller';
import { OnboardingController } from '../../modules/onboarding/onboarding.controller';
import { PayrollController } from '../../modules/payroll/payroll.controller';
import { RbacController } from '../../modules/rbac/rbac.controller';
import { RecruitmentController } from '../../modules/recruitment/recruitment.controller';
import { TimesheetsController } from '../../modules/timesheets/timesheets.controller';

const guard = new RolesGuard(new Reflector());

/** Builds the AuthUser a member of `roleName` would receive at login. */
function userFor(roleName: string): AuthUser {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    email: `${roleName}@example.com`,
    name: roleName,
    employeeId: 'employee-1',
    roles: [roleName],
    scopes: catalogRoleScopes(roleName),
    isSuperAdmin: false,
  } as AuthUser;
}

// The Tenant Owner scope list is unioned with a legacy constant at login; the role name
// alone is what the guards match on, so the catalog list is enough here.
const OWNER = userFor('Tenant Owner');

function allowed(controller: new (...args: never[]) => unknown, method: string, user: AuthUser): boolean {
  const context = {
    getHandler: () => (controller.prototype as Record<string, unknown>)[method],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return guard.canActivate(context);
}

describe('RolesGuard: Tenant Owner reaches previously blocked modules', () => {
  it.each([
    [RecruitmentController, 'createJob'],
    [RecruitmentController, 'decideJobApproval'],
    [OnboardingController, 'createTemplate'],
    [TimesheetsController, 'createProject'],
    [AssetsController, 'create'],
    [EngagementController, 'createSurvey'],
    [DeveloperController, 'createApiKey'],
    [DeveloperController, 'listWebhooks'],
  ])('%p.%s', (controller, method) => {
    expect(allowed(controller as never, method as string, OWNER)).toBe(true);
  });
});

describe('RolesGuard: recruitment management vs approval', () => {
  const recruiter = userFor('Recruiter');

  it.each(['createJob', 'updateJob', 'createCandidate', 'addCommunication', 'scheduleInterview', 'createOffer', 'updateOffer', 'generateOfferLetter'])(
    'lets a Recruiter manage recruitment: %s',
    (method) => {
      expect(allowed(RecruitmentController, method, recruiter)).toBe(true);
    },
  );

  it('lets a Recruiter read the pipeline', () => {
    expect(allowed(RecruitmentController, 'listJobs', recruiter)).toBe(true);
    expect(allowed(RecruitmentController, 'listCandidates', recruiter)).toBe(true);
  });

  it.each(['decideJobApproval', 'decideOfferApproval'])('refuses a Recruiter on %s', (method) => {
    expect(allowed(RecruitmentController, method, recruiter)).toBe(false);
  });

  it.each(['HR Admin', 'Manager'])('still lets %s decide approvals', (roleName) => {
    expect(allowed(RecruitmentController, 'decideJobApproval', userFor(roleName))).toBe(true);
    expect(allowed(RecruitmentController, 'decideOfferApproval', userFor(roleName))).toBe(true);
  });

  it('refuses an Employee on recruitment reads', () => {
    expect(allowed(RecruitmentController, 'listCandidates', userFor('Employee'))).toBe(false);
  });
});

describe('RolesGuard: leave self-service is authorised by the employee link', () => {
  const SELF_SERVICE = ['apply', 'cancel', 'myRequests', 'myBalances', 'types'];

  /** The same role, but the user account is not linked to an employee record. */
  const unlinked = (roleName: string): AuthUser => ({ ...userFor(roleName), employeeId: null }) as AuthUser;

  it.each(SYSTEM_ROLE_NAMES)('lets an employee-linked %s reach every self-service route', (roleName) => {
    for (const method of SELF_SERVICE) {
      expect(allowed(LeaveController, method, userFor(roleName))).toBe(true);
    }
  });

  it('lets an employee-linked Manager apply without any leave:write scope', () => {
    const manager = userFor('Manager');
    expect(manager.scopes).not.toContain('leave:write');
    expect(allowed(LeaveController, 'apply', manager)).toBe(true);
    expect(allowed(LeaveController, 'cancel', manager)).toBe(true);
  });

  // apply and cancel are self-service ONLY - no scope is an alternative route in.
  it.each(SYSTEM_ROLE_NAMES)('refuses %s on apply and cancel with no employee record', (roleName) => {
    expect(allowed(LeaveController, 'apply', unlinked(roleName))).toBe(false);
    expect(allowed(LeaveController, 'cancel', unlinked(roleName))).toBe(false);
  });

  it('refuses an unlinked technical role on the own-data reads too', () => {
    for (const roleName of ['Developer', 'Integration Admin']) {
      expect(allowed(LeaveController, 'myRequests', unlinked(roleName))).toBe(false);
      expect(allowed(LeaveController, 'myBalances', unlinked(roleName))).toBe(false);
      expect(allowed(LeaveController, 'types', unlinked(roleName))).toBe(false);
    }
  });

  // myRequests/myBalances/types also accept `leave:read`, so a leave-reading role without
  // an employee record still passes the guard. LeaveService is what refuses it - the guard
  // is the coarse gate, ownership is enforced where the employee is resolved.
  it('leaves the own-data reads to the service for an unlinked leave reader', () => {
    for (const roleName of ['Auditor', 'Employee', 'Manager']) {
      expect(allowed(LeaveController, 'myRequests', unlinked(roleName))).toBe(true);
      expect(allowed(LeaveController, 'types', unlinked(roleName))).toBe(true);
    }
  });

  it('refuses a machine token even when it carries the leave scopes', () => {
    const apiKey = {
      ...userFor('Employee'),
      authType: 'apiKey',
      employeeId: 'employee-1',
      scopes: ['leave:read', 'leave:write'],
    } as AuthUser;
    expect(allowed(LeaveController, 'apply', apiKey)).toBe(false);
    expect(allowed(LeaveController, 'cancel', apiKey)).toBe(false);
  });

  it('lets the platform Super Admin through, as everywhere else', () => {
    const platform = { ...userFor('Employee'), roles: [], isSuperAdmin: true } as AuthUser;
    expect(allowed(LeaveController, 'apply', platform)).toBe(true);
  });
});

describe('RolesGuard: leave configuration and approval are unchanged', () => {
  // Self-service does not run through `leave:write`, but leave setup still must not be
  // reachable by anyone who merely holds it: RolesGuard matches roles OR scopes.
  it.each(['createType', 'updateType', 'createPolicy', 'updatePolicy'])(
    'keeps leave setup on the Tenant Owner and HR Admin: %s',
    (method) => {
      expect(allowed(LeaveController, method, OWNER)).toBe(true);
      expect(allowed(LeaveController, method, userFor('HR Admin'))).toBe(true);
      for (const roleName of ['Manager', 'Employee', 'Payroll Admin', 'Finance Admin', 'Auditor', 'Recruiter']) {
        expect(allowed(LeaveController, method, userFor(roleName))).toBe(false);
      }
    },
  );

  it('keeps leave approval on the approver roles only', () => {
    for (const roleName of ['Tenant Owner', 'HR Admin', 'Manager']) {
      expect(allowed(LeaveController, 'approve', userFor(roleName))).toBe(true);
      expect(allowed(LeaveController, 'reject', userFor(roleName))).toBe(true);
    }
    for (const roleName of ['Employee', 'Recruiter', 'Auditor', 'Developer', 'Finance Admin']) {
      expect(allowed(LeaveController, 'approve', userFor(roleName))).toBe(false);
      expect(allowed(LeaveController, 'reject', userFor(roleName))).toBe(false);
    }
  });

  it('keeps the tenant-wide leave reads on the leave:read holders', () => {
    expect(allowed(LeaveController, 'list', userFor('Auditor'))).toBe(true);
    expect(allowed(LeaveController, 'list', userFor('Developer'))).toBe(false);
  });
});

describe('RolesGuard: payroll run lifecycle', () => {
  const LIFECYCLE = ['processRun', 'overrideWarnings', 'approveRun', 'lockRun', 'closeRun'];

  it.each(LIFECYCLE)('lets a Payroll Admin run %s', (method) => {
    expect(allowed(PayrollController, method, userFor('Payroll Admin'))).toBe(true);
  });

  it.each(LIFECYCLE)('lets a Tenant Owner run %s', (method) => {
    expect(allowed(PayrollController, method, OWNER)).toBe(true);
  });

  for (const roleName of ['HR Admin', 'Finance Admin', 'Manager']) {
    it.each(LIFECYCLE)(`refuses ${roleName} on %s`, (method) => {
      expect(allowed(PayrollController, method, userFor(roleName))).toBe(false);
    });
  }

  it('keeps expense approval working for Finance Admin and Manager', () => {
    expect(allowed(PayrollController, 'approveExpense', userFor('Finance Admin'))).toBe(true);
    expect(allowed(PayrollController, 'approveExpense', userFor('Manager'))).toBe(true);
  });

  it('keeps payroll configuration reachable for HR Admin', () => {
    expect(allowed(PayrollController, 'listRuns', userFor('HR Admin'))).toBe(true);
    expect(allowed(PayrollController, 'createRun', userFor('HR Admin'))).toBe(true);
  });
});

describe('RolesGuard: developer and integrations', () => {
  const developer = userFor('Developer');
  const integrationAdmin = userFor('Integration Admin');

  it('lets Developer manage API keys and integrations', () => {
    expect(allowed(DeveloperController, 'createApiKey', developer)).toBe(true);
    expect(allowed(DeveloperController, 'createWebhook', developer)).toBe(true);
  });

  it('lets Integration Admin manage integrations but not API keys', () => {
    expect(allowed(DeveloperController, 'createWebhook', integrationAdmin)).toBe(true);
    expect(allowed(DeveloperController, 'listWebhooks', integrationAdmin)).toBe(true);
    expect(allowed(DeveloperController, 'createApiKey', integrationAdmin)).toBe(false);
    expect(allowed(DeveloperController, 'listApiKeys', integrationAdmin)).toBe(false);
    expect(allowed(DeveloperController, 'createOAuthApp', integrationAdmin)).toBe(false);
  });

  it('gives Developer no HR or payroll access', () => {
    expect(allowed(PayrollController, 'listRuns', developer)).toBe(false);
    expect(allowed(PayrollController, 'processRun', developer)).toBe(false);
    expect(allowed(RecruitmentController, 'listCandidates', developer)).toBe(false);
    expect(allowed(OnboardingController, 'createTemplate', developer)).toBe(false);
  });

  it('refuses HR Admin and Employee on the developer console', () => {
    expect(allowed(DeveloperController, 'stats', userFor('HR Admin'))).toBe(false);
    expect(allowed(DeveloperController, 'stats', userFor('Employee'))).toBe(false);
  });
});

describe('RolesGuard: RBAC configuration', () => {
  it('lets HR Admin assign roles but not configure them', () => {
    const hr = userFor('HR Admin');
    expect(allowed(RbacController, 'assignUserRoles', hr)).toBe(true);
    expect(allowed(RbacController, 'users', hr)).toBe(true);
    expect(allowed(RbacController, 'createRole', hr)).toBe(false);
    expect(allowed(RbacController, 'updateRole', hr)).toBe(false);
    expect(allowed(RbacController, 'setPermissions', hr)).toBe(false);
    expect(allowed(RbacController, 'setFieldPermission', hr)).toBe(false);
  });

  it('lets Tenant Owner configure roles', () => {
    expect(allowed(RbacController, 'createRole', OWNER)).toBe(true);
    expect(allowed(RbacController, 'setPermissions', OWNER)).toBe(true);
  });

  it('refuses everyone else', () => {
    for (const roleName of ['Payroll Admin', 'Recruiter', 'Manager', 'Employee', 'Auditor', 'Developer']) {
      expect(allowed(RbacController, 'users', userFor(roleName))).toBe(false);
    }
  });
});

describe('RolesGuard: platform super admin', () => {
  it('bypasses every guard through the isSuperAdmin flag, not a tenant role', () => {
    const platform = { ...userFor('Employee'), roles: [], isSuperAdmin: true } as AuthUser;
    expect(allowed(PayrollController, 'lockRun', platform)).toBe(true);
    expect(allowed(RbacController, 'createRole', platform)).toBe(true);
    expect(allowed(DeveloperController, 'createApiKey', platform)).toBe(true);
  });
});

describe('RolesGuard: analytics dashboard stays reachable', () => {
  it('does not gate the dashboard route itself - the payload is filtered instead', () => {
    expect(allowed(AnalyticsController, 'dashboard', userFor('Employee'))).toBe(true);
  });
});
