import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AuthUser } from '../types/auth-user';
import { catalogRoleScopes } from '../../modules/rbac/role-catalog';
import { TaxController } from '../../modules/tax/tax.controller';
import { EmailController } from '../../modules/email/email.controller';
import { PerformanceController } from '../../modules/performance/performance.controller';
import { SearchController } from '../../modules/search/search.controller';
import { AnalyticsController } from '../../modules/analytics/analytics.controller';

/**
 * Employee-only access must stop at the API boundary, not just at the frontend route
 * guard. These tests run the REAL `RolesGuard` against the REAL decorators declared on
 * each controller method (via the same harness as `roles.guard.spec.ts`), so a decorator
 * accidentally removed or loosened later fails here — not just in a manual audit.
 */

const guard = new RolesGuard(new Reflector());

/** Builds the AuthUser a member of `roleName` would receive at login. */
function userFor(roleName: string, employeeId: string | null = 'employee-1'): AuthUser {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    email: `${roleName}@example.com`,
    name: roleName,
    employeeId,
    roles: [roleName],
    scopes: catalogRoleScopes(roleName),
    isSuperAdmin: false,
  } as AuthUser;
}

const EMPLOYEE = userFor('Employee');

function allowed(controller: new (...args: never[]) => unknown, method: string, user: AuthUser): boolean {
  const context = {
    getHandler: () => (controller.prototype as Record<string, unknown>)[method],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return guard.canActivate(context);
}

describe('Employee-only session cannot reach previously-ungated admin/tenant-wide routes', () => {
  it.each([
    [TaxController, 'getTaxYears'],
    [TaxController, 'getEmployeeTaxProfile'],
    [TaxController, 'upsertTaxProfile'],
    [TaxController, 'submitDeclaration'],
    [TaxController, 'calculateTds'],
    [EmailController, 'listSmtp'],
    [EmailController, 'createSmtp'],
    [EmailController, 'listTemplates'],
    [EmailController, 'sendTemplate'],
    [EmailController, 'sendBulk'],
    [EmailController, 'getLogs'],
    [PerformanceController, 'listGoals'],
    [PerformanceController, 'createGoal'],
    [PerformanceController, 'stats'],
    [SearchController, 'global'],
    [AnalyticsController, 'headcountTrend'],
    [AnalyticsController, 'attrition'],
    [AnalyticsController, 'demographics'],
    [AnalyticsController, 'reportBuilder'],
    [AnalyticsController, 'reportBuilderExport'],
  ])('%p.%s', (controller, method) => {
    expect(allowed(controller as never, method as string, EMPLOYEE)).toBe(false);
  });
});

describe('Employee-only session keeps its own self-service routes', () => {
  it.each([
    [EmailController, 'getPreferences'],
    [EmailController, 'updatePreferences'],
  ])('%p.%s', (controller, method) => {
    expect(allowed(controller as never, method as string, EMPLOYEE)).toBe(true);
  });
});

describe('Non-Employee roles keep existing access (regression guard)', () => {
  it.each([
    [TaxController, 'getTaxYears', userFor('HR Admin')],
    [TaxController, 'upsertTaxProfile', userFor('Payroll Admin')],
    [EmailController, 'listSmtp', userFor('Tenant Owner')],
    [EmailController, 'createTemplate', userFor('HR Admin')],
    [PerformanceController, 'listGoals', userFor('Manager')],
    [PerformanceController, 'listGoals', userFor('HR Admin')],
    [SearchController, 'global', userFor('Recruiter')],
    [AnalyticsController, 'headcountTrend', userFor('Finance Admin')],
    [AnalyticsController, 'attrition', userFor('Auditor')],
  ])('%p.%s allows %p', (controller, method, user) => {
    expect(allowed(controller as never, method as string, user as AuthUser)).toBe(true);
  });

  it('Manager cannot reach reports-builder/export even though Manager holds reports:read at DIRECT_REPORTS', () => {
    // CAPABILITY.reports on the frontend deliberately excludes Manager. Because
    // RolesGuard matches roles OR scopes, this route is gated on @Roles alone (no
    // @Scopes), so Manager's `reports:read` scope cannot let them back in.
    const manager = userFor('Manager');
    expect(allowed(AnalyticsController, 'reportBuilder', manager)).toBe(false);
  });
});
