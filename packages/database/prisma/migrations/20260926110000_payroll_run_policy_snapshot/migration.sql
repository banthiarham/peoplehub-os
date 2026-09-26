-- Records the resolved payroll policy inputs a run was processed with, and a hash of them,
-- so a run whose policies have since changed can be flagged as stale. Null for runs
-- processed before this existed; those are never reported stale.
ALTER TABLE "payroll_runs" ADD COLUMN "policySnapshot" JSONB,
ADD COLUMN "policyHash" TEXT;
