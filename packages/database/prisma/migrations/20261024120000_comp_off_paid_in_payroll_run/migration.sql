-- Database-enforced ownership of an unused comp-off payout.
--
-- Until now the only record of "this run paid this grant" was the grant id inside a
-- COMP_OFF_PAYOUT input's `metadata.grantIds`, which is a JSON array: nothing to lock and
-- nothing to constrain. Two statements that each read it and then write were free to
-- interleave, so a grant could be paid by a locked run and marked USED at the same instant,
-- or paid by two runs at once. This column gives that ownership a row of its own, so the
-- claim is a conditional UPDATE on one row and the database picks the winner.
--
-- Plain TEXT with no foreign key, matching `expense_claims.reimbursedInPayrollRunId`: a
-- finalized payout claim must not be released by a cascade or a SET NULL if anything ever
-- happens to the run row.
ALTER TABLE "comp_off_grants" ADD COLUMN "paidInPayrollRunId" TEXT;

CREATE INDEX "comp_off_grants_paidInPayrollRunId_idx" ON "comp_off_grants"("paidInPayrollRunId");

-- Backfill: adopt the ownership that already exists, and refuse to invent any that does not.
--
-- Only runs past the point of no return (LOCKED, PUBLISHED, CLOSED) count as having paid.
-- A REVIEW or APPROVED run has merely *generated* a payout input, which reprocessing can
-- still withdraw - claiming those would strand grants that are legitimately still decidable.
--
-- A grant named by finalized payouts in two different runs is the historical double-pay this
-- work exists to prevent. There is no correct way to pick one, so the migration fails and
-- names them rather than choosing. Reconcile those runs, then re-run it.
DO $$
DECLARE
  conflicting TEXT;
BEGIN
  CREATE TEMP TABLE _comp_off_finalized_claims ON COMMIT DROP AS
  SELECT DISTINCT
    grant_row.id          AS grant_id,
    input."payrollRunId"  AS run_id
  FROM "payroll_variable_inputs" AS input
  JOIN "payroll_runs" AS run
    ON run.id = input."payrollRunId"
  -- `metadata` is free-form JSON: anything that is not an array of strings contributes
  -- nothing, rather than raising inside the expansion. Mirrors `compOffPayoutGrantIds`.
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(input.metadata -> 'grantIds') = 'array' THEN input.metadata -> 'grantIds'
      ELSE '[]'::jsonb
    END
  ) AS element
  JOIN "comp_off_grants" AS grant_row
    ON grant_row.id = (element #>> '{}')
    -- Tenant-scoped, so an id that collides across tenants cannot claim the wrong grant.
   AND grant_row."tenantId" = input."tenantId"
  WHERE input.type = 'COMP_OFF_PAYOUT'
    AND input.source = 'COMP_OFF'
    AND run.status IN ('LOCKED', 'PUBLISHED', 'CLOSED')
    AND jsonb_typeof(element) = 'string';

  SELECT string_agg(duplicated.grant_id || ' (' || duplicated.run_count || ' runs)', ', ')
    INTO conflicting
    FROM (
      SELECT grant_id, count(DISTINCT run_id) AS run_count
        FROM _comp_off_finalized_claims
       GROUP BY grant_id
      HAVING count(DISTINCT run_id) > 1
    ) AS duplicated;

  IF conflicting IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot backfill comp-off payout ownership: these grants were already paid by more than one finalized payroll run: %. This migration will not choose an owner - reconcile the duplicate payouts first, then re-run it.',
      conflicting;
  END IF;

  UPDATE "comp_off_grants" AS grant_row
     SET "paidInPayrollRunId" = claim.run_id
    FROM _comp_off_finalized_claims AS claim
   WHERE grant_row.id = claim.grant_id;
END $$;
