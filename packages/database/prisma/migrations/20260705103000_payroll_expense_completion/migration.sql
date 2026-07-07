-- Module 6/7 completion: payroll dimensions, variable inputs, warning overrides,
-- richer expense reimbursement workflow, and loan repayment ledger.

CREATE TYPE "PayrollRunType" AS ENUM ('MONTHLY', 'OFF_CYCLE', 'FULL_AND_FINAL');
CREATE TYPE "ExpenseReimbursementMethod" AS ENUM ('PAYROLL', 'DIRECT');

ALTER TYPE "ExpenseStatus" ADD VALUE IF NOT EXISTS 'CLARIFICATION_REQUESTED';

DROP INDEX IF EXISTS "payroll_runs_tenantId_month_year_key";

ALTER TABLE "payroll_runs"
  ADD COLUMN "legalEntityId" TEXT,
  ADD COLUMN "locationId" TEXT,
  ADD COLUMN "payGroup" TEXT,
  ADD COLUMN "runType" "PayrollRunType" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "warningOverrideReason" TEXT,
  ADD COLUMN "warningsOverriddenAt" TIMESTAMP(3),
  ADD COLUMN "warningsOverriddenById" TEXT;

CREATE INDEX "payroll_runs_tenantId_month_year_runType_idx"
  ON "payroll_runs"("tenantId", "month", "year", "runType");
CREATE INDEX "payroll_runs_tenantId_legalEntityId_idx"
  ON "payroll_runs"("tenantId", "legalEntityId");
CREATE INDEX "payroll_runs_tenantId_locationId_idx"
  ON "payroll_runs"("tenantId", "locationId");

CREATE TABLE "payroll_variable_inputs" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "payrollRunId" TEXT,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "taxable" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'APPROVED',
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "metadata" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payroll_variable_inputs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payroll_variable_inputs_tenantId_month_year_idx"
  ON "payroll_variable_inputs"("tenantId", "month", "year");
CREATE INDEX "payroll_variable_inputs_employeeId_idx"
  ON "payroll_variable_inputs"("employeeId");
CREATE INDEX "payroll_variable_inputs_payrollRunId_idx"
  ON "payroll_variable_inputs"("payrollRunId");

ALTER TABLE "payroll_variable_inputs"
  ADD CONSTRAINT "payroll_variable_inputs_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_variable_inputs"
  ADD CONSTRAINT "payroll_variable_inputs_payrollRunId_fkey"
  FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expense_claims"
  ADD COLUMN "ocrData" JSONB,
  ADD COLUMN "reimbursementMethod" "ExpenseReimbursementMethod" NOT NULL DEFAULT 'PAYROLL',
  ADD COLUMN "clarificationNote" TEXT,
  ADD COLUMN "decidedById" TEXT,
  ADD COLUMN "decidedAt" TIMESTAMP(3);

CREATE TABLE "loan_installments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "payrollRunId" TEXT,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "principalAmount" DOUBLE PRECISION NOT NULL,
  "openingBalance" DOUBLE PRECISION NOT NULL,
  "closingBalance" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "deductedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "loan_installments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "loan_installments_loanId_month_year_key"
  ON "loan_installments"("loanId", "month", "year");
CREATE INDEX "loan_installments_tenantId_month_year_idx"
  ON "loan_installments"("tenantId", "month", "year");
CREATE INDEX "loan_installments_employeeId_idx"
  ON "loan_installments"("employeeId");

ALTER TABLE "loan_installments"
  ADD CONSTRAINT "loan_installments_loanId_fkey"
  FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loan_installments"
  ADD CONSTRAINT "loan_installments_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loan_installments"
  ADD CONSTRAINT "loan_installments_payrollRunId_fkey"
  FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
