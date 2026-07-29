-- AlterTable
ALTER TABLE "shifts" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: mark the oldest active shift as the default for every tenant
-- that doesn't already have one. Without this, employees with no explicit
-- shift assignment fell back to an arbitrary, non-deterministic shift.
WITH ranked_shifts AS (
  SELECT id, "tenantId",
         ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt" ASC) AS rn
  FROM "shifts"
  WHERE "isActive" = true
)
UPDATE "shifts"
SET "isDefault" = true
WHERE id IN (
  SELECT rs.id
  FROM ranked_shifts rs
  WHERE rs.rn = 1
    AND NOT EXISTS (
      SELECT 1 FROM "shifts" s2 WHERE s2."tenantId" = rs."tenantId" AND s2."isDefault" = true
    )
);
