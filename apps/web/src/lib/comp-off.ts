/**
 * Payload rules for the comp-off decision call (`PATCH /attendance/comp-offs/:id`).
 *
 * Framework-free on purpose: the attendance page is the only caller, but the rule worth
 * testing is which payload a decision produces. Marking a grant USED is not a balance
 * deduction — it is spent against one named scheduled working day, and the API requires
 * that day. Sending `{ status: 'USED' }` alone is rejected with a 400, so the dialog has
 * to collect the date before it can submit.
 *
 * The API re-validates everything (same usage period, not a weekly off or holiday, grant
 * still available). None of this is a security boundary; it exists so the button is
 * disabled instead of producing an avoidable error.
 */

/** The terminal decisions the API accepts. Mirrors COMP_OFF_DECISION_STATUSES on the API. */
export type CompOffDecision = 'USED' | 'CANCELLED' | 'EXPIRED';

/**
 * How a grant's `days` reads to a human.
 *
 * A bare `0.5` in a table tells an administrator nothing about what the credit can be spent
 * on, and the duration now decides that entirely: a half-day credit is only usable against a
 * half-day absence. So the number is always shown with the word for it. Anything other than
 * 0.5 or 1 can only be a grant credited before the manual form was narrowed to those two, and
 * is shown as-is rather than mislabelled.
 */
export function compOffDurationLabel(days: number): string {
  if (days === 0.5) return 'Half day (0.5)';
  if (days === 1) return 'Full day (1)';
  return `${days} days`;
}

/**
 * What the ledger should actually show for a grant, as opposed to the column it stores.
 *
 * Two cases make the stored `status` misleading on its own:
 *
 *  - **Paid out.** Payroll never writes `status`; it records the claim in `paidInPayrollRunId`
 *    when the run locks. So a grant whose money has already gone out still reads `AVAILABLE`,
 *    and the ledger offered "Mark used" on it - an action the API would (correctly) refuse.
 *  - **Expired.** Nothing automatically moves a grant to `EXPIRED`; the date simply passes.
 *    Under an enforced expiry policy the grant is unusable from that day, so showing it as
 *    available misstates the balance.
 *
 * Neither case writes anything: the stored status is left exactly as it is, and historical
 * rows are not rewritten. This is a presentation decision only, which is why it lives here
 * rather than in a migration.
 */
export type CompOffDisplayState = 'AVAILABLE' | 'USED' | 'EXPIRED' | 'CANCELLED' | 'PAID';

export function compOffDisplayState(
  grant: { status: string; expiresAt?: string | null; paidInPayrollRunId?: string | null },
  policy: { expiryEnforced: boolean },
  today = new Date(),
): CompOffDisplayState {
  if (grant.paidInPayrollRunId) return 'PAID';
  if (grant.status !== 'AVAILABLE') return grant.status as CompOffDisplayState;
  if (policy.expiryEnforced && grant.expiresAt) {
    // Inclusive, matching the API: the grant is usable *on* its expiry date.
    const expiry = new Date(`${grant.expiresAt.slice(0, 10)}T00:00:00.000Z`);
    const day = new Date(`${today.toISOString().slice(0, 10)}T00:00:00.000Z`);
    if (day > expiry) return 'EXPIRED';
  }
  return 'AVAILABLE';
}

/** The label for a display state. `PAID` names where the money went, not a stored status. */
export function compOffStateLabel(state: CompOffDisplayState): string {
  switch (state) {
    case 'PAID':
      return 'Paid in payroll';
    case 'AVAILABLE':
      return 'Available';
    case 'USED':
      return 'Used';
    case 'EXPIRED':
      return 'Expired';
    case 'CANCELLED':
      return 'Cancelled';
  }
}

/**
 * Whether a grant can still be decided (used, cancelled, marked expired).
 *
 * Only a genuinely available grant can. A paid grant is excluded even though its stored status
 * is still `AVAILABLE` - that is the whole point - and so is one past an enforced expiry, which
 * the API would refuse anyway. Keeping the button and the API's answer in agreement is what
 * stops the ledger offering an action that cannot succeed.
 */
export function compOffIsActionable(state: CompOffDisplayState): boolean {
  return state === 'AVAILABLE';
}

export interface CompOffDecisionPayload {
  status: CompOffDecision;
  /** Present only for USED — the API rejects it for any other status. */
  usedOnDate?: string;
}

/** `<input type="date">` emits exactly this, which is also the API's accepted day format. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The request body for a decision, or `null` when it is not submittable yet — today that
 * means USED without a usable `usedOnDate`.
 */
export function compOffDecisionPayload(
  status: CompOffDecision,
  usedOnDate?: string,
): CompOffDecisionPayload | null {
  if (status !== 'USED') return { status };
  const day = usedOnDate?.trim();
  if (!day || !DATE_ONLY.test(day)) return null;
  return { status, usedOnDate: day };
}
