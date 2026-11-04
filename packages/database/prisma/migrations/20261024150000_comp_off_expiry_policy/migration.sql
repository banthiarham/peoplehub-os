-- Tenant-configurable comp-off expiry.
--
-- Until now every grant was stamped with a hardcoded 90-day `expiresAt` that almost nothing
-- read: outside carry-forward it was inert, so a grant stayed usable to the end of its usage
-- period whatever date it carried. These two columns let a tenant turn that date into a real
-- deadline and say what an expired unused grant is worth.
--
-- Additive and non-destructive by design. `compOffExpiryTreatment` defaults to NOT_ENFORCED,
-- which is exactly the behaviour every existing row already has, so no tenant's grants change
-- meaning when this is applied. There is deliberately NO backfill: every historical grant
-- carries a 90-day date nobody chose, and enforcing those retroactively would expire balances
-- employees were promised. A tenant opts in explicitly, and `expiresAt` on existing grants is
-- never rewritten.
CREATE TYPE "CompOffExpiryTreatment" AS ENUM ('NOT_ENFORCED', 'FORFEIT', 'PAY_OUT');

ALTER TABLE "payroll_policies" ADD COLUMN "compOffExpiryDays" INTEGER;

ALTER TABLE "payroll_policies"
  ADD COLUMN "compOffExpiryTreatment" "CompOffExpiryTreatment" NOT NULL DEFAULT 'NOT_ENFORCED';
