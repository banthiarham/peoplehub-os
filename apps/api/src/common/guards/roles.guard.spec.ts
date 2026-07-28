import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AuthUser } from '../types/auth-user';
import { catalogRoleScopes } from '../../modules/rbac/role-catalog';
import { AnalyticsController } from '../../modules/analytics/analytics.controller';
import { AssetsController } from '../../modules/assets/assets.controller';
import { DeveloperController } from '../../modules/developer/developer.controller';
import { EngagementController } from '../../modules/engagement/engagement.controller';
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
