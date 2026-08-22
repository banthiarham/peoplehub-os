-- The claimant's reply to an approver's clarification request. Kept separate from
-- `clarificationNote` so the question and the answer both stay readable once the claim
-- goes back for a decision.
ALTER TABLE "expense_claims" ADD COLUMN "clarificationResponse" TEXT;
