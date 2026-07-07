-- P3: engagement feed/rewards and PSA project budgeting depth
ALTER TABLE "projects"
  ADD COLUMN "budgetHours" DOUBLE PRECISION,
  ADD COLUMN "billingRate" DOUBLE PRECISION;

ALTER TABLE "recognitions"
  ADD COLUMN "points" INTEGER NOT NULL DEFAULT 10;

CREATE TABLE "announcements" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "audience" TEXT NOT NULL DEFAULT 'ALL',
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "publishAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "announcements_tenantId_status_publishAt_idx"
  ON "announcements"("tenantId", "status", "publishAt");

ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
