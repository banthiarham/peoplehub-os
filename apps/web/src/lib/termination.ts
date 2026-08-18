/**
 * Confirmation rules for the immediate-termination dialog.
 *
 * Framework-free on purpose: the dialog is the only caller, but the matching rule is the
 * thing worth testing, and it has to stay identical to `normalizeConfirmationName` in
 * `apps/api/src/modules/employees/employees.service.ts`. If the two drift, the button
 * enables on input the API then rejects with a 400.
 *
 * The API re-checks everything here. None of it is a security boundary; it exists so a
 * destructive, irreversible action needs a deliberate keystroke rather than one click.
 */

/** Statuses for which there is nothing left to terminate. Mirrors TERMINAL_EMPLOYEE_STATUSES. */
const TERMINAL_STATUSES = ['EXITED', 'INACTIVE'];

/** Surrounding and repeated whitespace is noise; capitalisation is not worth a failed attempt. */
function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function employeeFullName(employee: { firstName?: string | null; lastName?: string | null }): string {
  return `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim();
}

/** True when the typed confirmation matches the employee's full name. */
export function confirmationMatches(typed: string, fullName: string): boolean {
  const expected = normalize(fullName);
  // An employee with no name on record must not be confirmable by an empty box.
  if (!expected) return false;
  return normalize(typed) === expected;
}

export function isTerminalStatus(status: string | null | undefined): boolean {
  return !!status && TERMINAL_STATUSES.includes(status);
}

/** True when `effectiveDate` (a yyyy-mm-dd input value) is today or earlier, in UTC days. */
export function isEffectiveDateAllowed(effectiveDate: string, today = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return false;
  const parsed = Date.parse(`${effectiveDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return false;
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return parsed <= todayUtc;
}

export interface TerminationFormState {
  effectiveDate: string;
  reason: string;
  confirmName: string;
}

/**
 * The single gate the dialog's submit button reads. Every condition is also enforced by
 * the API; this only keeps the button from offering an action that cannot succeed.
 */
export function canSubmitTermination(
  form: TerminationFormState,
  employee: { firstName?: string | null; lastName?: string | null; status?: string | null },
  options: { pending?: boolean; today?: Date } = {},
): boolean {
  if (options.pending) return false;
  if (isTerminalStatus(employee.status)) return false;
  if (!form.reason.trim()) return false;
  if (!isEffectiveDateAllowed(form.effectiveDate, options.today ?? new Date())) return false;
  return confirmationMatches(form.confirmName, employeeFullName(employee));
}
