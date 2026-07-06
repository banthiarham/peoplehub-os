-- Module 8 and 9 completion fields.

ALTER TABLE "job_requisitions"
  ADD COLUMN "hiringManagerId" TEXT,
  ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedReason" TEXT,
  ADD COLUMN "targetStartDate" DATE,
  ADD COLUMN "priority" TEXT,
  ADD COLUMN "publishedAt" TIMESTAMP(3);

CREATE INDEX "job_requisitions_hiringManagerId_idx" ON "job_requisitions"("hiringManagerId");

UPDATE "job_requisitions"
SET "approvalStatus" = 'APPROVED',
    "approvedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP),
    "publishedAt" = COALESCE("publishedAt", "updatedAt", CURRENT_TIMESTAMP)
WHERE "status" = 'OPEN';

ALTER TABLE "candidates" ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "candidates"
  ADD COLUMN "resumeFileName" TEXT,
  ADD COLUMN "resumeUploadedAt" TIMESTAMP(3),
  ADD COLUMN "resumeParsed" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "ownerId" TEXT,
  ADD COLUMN "stageHistory" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "convertedAt" TIMESTAMP(3);

CREATE INDEX "candidates_email_idx" ON "candidates"("email");

CREATE TABLE "candidate_communications" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'EMAIL',
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SENT',
  "sentById" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "candidate_communications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "candidate_communications_tenantId_idx" ON "candidate_communications"("tenantId");
CREATE INDEX "candidate_communications_candidateId_idx" ON "candidate_communications"("candidateId");

ALTER TABLE "candidate_communications"
  ADD CONSTRAINT "candidate_communications_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "offers"
  ADD COLUMN "fixedPay" DOUBLE PRECISION,
  ADD COLUMN "variablePay" DOUBLE PRECISION,
  ADD COLUMN "designationId" TEXT,
  ADD COLUMN "locationId" TEXT,
  ADD COLUMN "salaryStructureId" TEXT,
  ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedReason" TEXT,
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "letterHtml" TEXT,
  ADD COLUMN "letterGeneratedAt" TIMESTAMP(3);

ALTER TABLE "onboarding_templates"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "locationId" TEXT,
  ADD COLUMN "employmentType" TEXT,
  ADD COLUMN "roleScope" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "documentChecklist" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "joiningForms" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "welcomeEmail" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "policyChecklist" JSONB NOT NULL DEFAULT '[]';

CREATE INDEX "onboarding_templates_departmentId_idx" ON "onboarding_templates"("departmentId");
CREATE INDEX "onboarding_templates_locationId_idx" ON "onboarding_templates"("locationId");

ALTER TABLE "onboarding_tasks"
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "isMandatory" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "requiresUpload" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "documentKey" TEXT,
  ADD COLUMN "formResponse" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "policyKey" TEXT,
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "buddyEmployeeId" TEXT;

ALTER TABLE "exit_requests"
  ADD COLUMN "noticePeriodDays" INTEGER,
  ADD COLUMN "managerApprovalStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "hrApprovalStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "assetRecoveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "knowledgeTransferStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "exitInterviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "finalSettlementStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "experienceLetterKey" TEXT,
  ADD COLUMN "relievingLetterKey" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3);

ALTER TABLE "exit_tasks"
  ADD COLUMN "exitRequestId" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "isMandatory" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "documentKey" TEXT;

CREATE INDEX "exit_tasks_exitRequestId_idx" ON "exit_tasks"("exitRequestId");

ALTER TABLE "exit_tasks"
  ADD CONSTRAINT "exit_tasks_exitRequestId_fkey"
  FOREIGN KEY ("exitRequestId") REFERENCES "exit_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
