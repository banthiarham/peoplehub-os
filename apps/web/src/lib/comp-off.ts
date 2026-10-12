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
