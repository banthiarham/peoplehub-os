-- Module 5 completion: attendance rules, roster operations, shift swaps,
-- comp-off grants, finalization batches, and richer leave policy controls.

CREATE TYPE "RosterUploadStatus" AS ENUM ('DRAFT', 'IMPORTED', 'FAILED');
CREATE TYPE "ShiftSwapStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "CompOffStatus" AS ENUM ('AVAILABLE', 'USED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "AttendanceFinalizationStatus" AS ENUM ('FINALIZED', 'REOPENED');

ALTER TABLE "shifts"
  ADD COLUMN "earlyLeavingGraceMins" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "breakDurationMins" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "minWorkingMinutes" INTEGER NOT NULL DEFAULT 480,
  ADD COLUMN "halfDayAfterMinutes" INTEGER NOT NULL DEFAULT 240,
  ADD COLUMN "absentAfterMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "overtimeAfterMinutes" INTEGER NOT NULL DEFAULT 480,
  ADD COLUMN "shiftAllowanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "remoteAllowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "weekendWorkAllowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "holidayWorkAllowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "compOffEligible" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "shift_assignments"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "rosterUploadId" TEXT;

ALTER TABLE "attendance_records"
  ADD COLUMN "shiftId" TEXT,
  ADD COLUMN "finalizationId" TEXT;

ALTER TABLE "leave_policies"
  ADD COLUMN "locationId" TEXT,
  ADD COLUMN "maxAnnualDays" DOUBLE PRECISION,
  ADD COLUMN "maxCarryForwardDays" INTEGER,
  ADD COLUMN "encashmentAllowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "encashmentMaxDays" DOUBLE PRECISION,
  ADD COLUMN "expiryDays" INTEGER,
  ADD COLUMN "minDuration" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "maxDuration" DOUBLE PRECISION,
  ADD COLUMN "requiresAttachment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowNegativeBalance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "genderRestriction" TEXT,
  ADD COLUMN "employmentTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "leave_requests"
  ADD COLUMN "policySnapshot" JSONB;

CREATE TABLE "attendance_rules" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shiftId" TEXT,
  "locationId" TEXT,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "gracePeriodMins" INTEGER NOT NULL DEFAULT 15,
  "lateMarkAfterMins" INTEGER NOT NULL DEFAULT 15,
  "earlyLeavingGraceMins" INTEGER NOT NULL DEFAULT 15,
  "halfDayAfterMinutes" INTEGER NOT NULL DEFAULT 240,
  "absentAfterMinutes" INTEGER NOT NULL DEFAULT 0,
  "breakDurationMins" INTEGER NOT NULL DEFAULT 60,
  "minWorkingMinutes" INTEGER NOT NULL DEFAULT 480,
  "overtimeAfterMinutes" INTEGER NOT NULL DEFAULT 480,
  "remoteAttendanceAllowed" BOOLEAN NOT NULL DEFAULT false,
  "shiftToleranceMins" INTEGER NOT NULL DEFAULT 0,
  "weekendWorkAllowed" BOOLEAN NOT NULL DEFAULT false,
  "holidayWorkAllowed" BOOLEAN NOT NULL DEFAULT false,
  "compOffEligible" BOOLEAN NOT NULL DEFAULT false,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roster_uploads" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "RosterUploadStatus" NOT NULL DEFAULT 'DRAFT',
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "uploadedById" TEXT,
  "importedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "errors" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roster_uploads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roster_upload_rows" (
  "id" TEXT NOT NULL,
  "rosterUploadId" TEXT NOT NULL,
  "employeeId" TEXT,
  "employeeCode" TEXT NOT NULL,
  "shiftId" TEXT,
  "shiftName" TEXT,
  "date" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IMPORTED',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roster_upload_rows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_finalizations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "locationId" TEXT,
  "status" "AttendanceFinalizationStatus" NOT NULL DEFAULT 'FINALIZED',
  "finalizedById" TEXT,
  "finalizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reopenedAt" TIMESTAMP(3),
  "notes" TEXT,
  "summary" JSONB,
  CONSTRAINT "attendance_finalizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shift_swap_requests" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "requesterEmployeeId" TEXT NOT NULL,
  "counterpartEmployeeId" TEXT,
  "requestedShiftId" TEXT NOT NULL,
  "targetShiftId" TEXT NOT NULL,
  "requestedDate" DATE NOT NULL,
  "targetDate" DATE NOT NULL,
  "reason" TEXT,
  "status" "ShiftSwapStatus" NOT NULL DEFAULT 'REQUESTED',
  "approverId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shift_swap_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "comp_off_grants" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "sourceAttendanceRecordId" TEXT,
  "earnedDate" DATE NOT NULL,
  "days" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3),
  "status" "CompOffStatus" NOT NULL DEFAULT 'AVAILABLE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "comp_off_grants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attendance_rules_tenantId_idx" ON "attendance_rules"("tenantId");
CREATE INDEX "attendance_rules_shiftId_idx" ON "attendance_rules"("shiftId");
CREATE INDEX "attendance_rules_locationId_idx" ON "attendance_rules"("locationId");
CREATE INDEX "roster_uploads_tenantId_idx" ON "roster_uploads"("tenantId");
CREATE INDEX "roster_upload_rows_rosterUploadId_idx" ON "roster_upload_rows"("rosterUploadId");
CREATE INDEX "roster_upload_rows_employeeId_idx" ON "roster_upload_rows"("employeeId");
CREATE INDEX "attendance_finalizations_tenantId_month_year_idx" ON "attendance_finalizations"("tenantId", "month", "year");
CREATE INDEX "shift_swap_requests_tenantId_idx" ON "shift_swap_requests"("tenantId");
CREATE INDEX "shift_swap_requests_requesterEmployeeId_idx" ON "shift_swap_requests"("requesterEmployeeId");
CREATE INDEX "comp_off_grants_tenantId_idx" ON "comp_off_grants"("tenantId");
CREATE INDEX "comp_off_grants_employeeId_idx" ON "comp_off_grants"("employeeId");

CREATE INDEX "shift_assignments_shiftId_idx" ON "shift_assignments"("shiftId");
CREATE INDEX "shift_assignments_rosterUploadId_idx" ON "shift_assignments"("rosterUploadId");
CREATE INDEX "attendance_records_shiftId_idx" ON "attendance_records"("shiftId");
CREATE INDEX "attendance_records_finalizationId_idx" ON "attendance_records"("finalizationId");
CREATE INDEX "leave_policies_leaveTypeId_idx" ON "leave_policies"("leaveTypeId");
CREATE INDEX "leave_policies_locationId_idx" ON "leave_policies"("locationId");

ALTER TABLE "attendance_rules" ADD CONSTRAINT "attendance_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_rules" ADD CONSTRAINT "attendance_rules_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_rules" ADD CONSTRAINT "attendance_rules_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "roster_uploads" ADD CONSTRAINT "roster_uploads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roster_uploads" ADD CONSTRAINT "roster_uploads_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "roster_upload_rows" ADD CONSTRAINT "roster_upload_rows_rosterUploadId_fkey" FOREIGN KEY ("rosterUploadId") REFERENCES "roster_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roster_upload_rows" ADD CONSTRAINT "roster_upload_rows_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "roster_upload_rows" ADD CONSTRAINT "roster_upload_rows_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_rosterUploadId_fkey" FOREIGN KEY ("rosterUploadId") REFERENCES "roster_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_finalizations" ADD CONSTRAINT "attendance_finalizations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_finalizations" ADD CONSTRAINT "attendance_finalizations_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_finalizationId_fkey" FOREIGN KEY ("finalizationId") REFERENCES "attendance_finalizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_requesterEmployeeId_fkey" FOREIGN KEY ("requesterEmployeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_counterpartEmployeeId_fkey" FOREIGN KEY ("counterpartEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_requestedShiftId_fkey" FOREIGN KEY ("requestedShiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_targetShiftId_fkey" FOREIGN KEY ("targetShiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "comp_off_grants" ADD CONSTRAINT "comp_off_grants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comp_off_grants" ADD CONSTRAINT "comp_off_grants_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comp_off_grants" ADD CONSTRAINT "comp_off_grants_sourceAttendanceRecordId_fkey" FOREIGN KEY ("sourceAttendanceRecordId") REFERENCES "attendance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
