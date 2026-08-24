import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../types/auth-user';

/**
 * Roles whose approval grant is already tenant-wide by design (see e.g.
 * `EXPENSE_ALL_CLAIMS_ROLES` in payroll.service.ts and the admin bypass in
 * WorkflowsService.listApprovals). Only `Manager` is scoped to direct reports.
 */
const ELEVATED_APPROVER_ROLES = ['Super Admin', 'Tenant Owner', 'HR Admin', 'Payroll Admin', 'Finance Admin'];

/**
 * Enforces the two authorization rules route-level `@Roles`/`@Scopes` guards cannot express
 * because they don't see the record being decided: nobody may approve their own request, and
 * a caller who qualifies for the route only via the `Manager` role may act only on requests
 * from their direct reports (`employee.managerId === user.employeeId`). Callers holding an
 * elevated role, an API key, or super admin keep their existing tenant-wide approval reach.
 */
export function assertCanDecideApproval(
  user: AuthUser,
  requesterEmployeeId: string | null | undefined,
  requesterManagerId: string | null | undefined,
): void {
  if (requesterEmployeeId && user.employeeId && requesterEmployeeId === user.employeeId) {
    throw new ForbiddenException('You cannot approve your own request.');
  }

  if (user.isSuperAdmin || user.authType === 'apiKey') return;

  const roles = user.roles ?? [];
  const isElevated = roles.some((role) => ELEVATED_APPROVER_ROLES.includes(role));
  if (isElevated) return;

  const isManager = roles.includes('Manager');
  if (isManager) {
    if (!user.employeeId || requesterManagerId !== user.employeeId) {
      throw new ForbiddenException('You can only approve requests from employees who report to you.');
    }
    return;
  }

  throw new ForbiddenException('You are not authorized to approve this request.');
}
