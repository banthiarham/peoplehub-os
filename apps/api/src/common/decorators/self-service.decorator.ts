import { SetMetadata } from '@nestjs/common';

export const SELF_SERVICE_KEY = 'selfService';

/**
 * Marks a route that a person may call about their OWN record, whatever their role.
 *
 * Authorisation is the caller's employee link, not a module scope. `RolesGuard` admits an
 * interactive session that carries an `employeeId`; machine tokens (API key / client
 * credentials) never carry one and are refused. The route's service is still responsible
 * for confirming the employee is active and for deriving the target employee from the
 * token - never from the request body.
 *
 * Use this instead of widening a module scope. A scope such as `leave:write` is shared
 * with administrative routes, so granting it to make self-service work also grants
 * whatever else matches it: `RolesGuard` treats roles and scopes as alternatives.
 */
export const SelfService = () => SetMetadata(SELF_SERVICE_KEY, true);
