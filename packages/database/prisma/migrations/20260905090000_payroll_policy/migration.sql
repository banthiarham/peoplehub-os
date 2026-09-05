-- Payroll policy foundation: tenant/location-scoped configuration for salary basis,
-- overtime payment eligibility and comp-off treatment. Storage and resolution only;
-- no calculation, OT or comp-off usage/carry-forward behavior is implemented here.
CREATE TYPE "SalaryBasis" AS ENUM (
  'CALENDAR_DAYS',
  'FIXED_DAYS',
  'WORKING_DAYS'
);

CREATE TYPE "CompOffUnusedTreatment" AS ENUM (
  'PAY',
  'UNPAID'
);

CREATE TYPE "CompOffUsagePeriod" AS ENUM (
  'MONTHLY',
  'ANNUAL'
);

CREATE TABLE "payroll_policies" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "locationId" TEXT,
  "salaryBasis" "SalaryBasis" NOT NULL DEFAULT 'CALENDAR_DAYS',
  "fixedDays" INTEGER,
  "overtimePaymentEnabled" BOOLEAN NOT NULL DEFAULT false,
  "compOffEnabled" BOOLEAN NOT NULL DEFAULT false,
  "compOffUnusedTreatment" "CompOffUnusedTreatment" NOT NULL DEFAULT 'UNPAID',
  "compOffUsagePeriod" "CompOffUsagePeriod" NOT NULL DEFAULT 'MONTHLY',
  "compOffCarryForwardEnabled" BOOLEAN NOT NULL DEFAULT false,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payroll_policies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payroll_policies_tenantId_idx" ON "payroll_policies"("tenantId");
CREATE INDEX "payroll_policies_locationId_idx" ON "payroll_policies"("locationId");
-- Matches @@unique([tenantId, locationId]): one policy per tenant + location.
CREATE UNIQUE INDEX "payroll_policies_tenantId_locationId_key"
  ON "payroll_policies"("tenantId", "locationId");
-- Postgres treats NULLs as distinct, so the constraint above does not stop a tenant from
-- holding several tenant-wide rows. Prisma cannot express a partial index, hence raw SQL.
CREATE UNIQUE INDEX "payroll_policies_tenant_default_key"
  ON "payroll_policies"("tenantId")
  WHERE "locationId" IS NULL;

ALTER TABLE "payroll_policies"
  ADD CONSTRAINT "payroll_policies_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_policies"
  ADD CONSTRAINT "payroll_policies_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
