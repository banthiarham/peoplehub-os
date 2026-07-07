-- Module 14: Timesheets, Projects, Clients, and Tasks

CREATE TABLE "clients" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "industry" TEXT,
  "website" TEXT,
  "billingContact" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_tasks" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "projectId" TEXT,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT,
  "isBillable" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "rateOverride" DOUBLE PRECISION,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "projects"
  ADD COLUMN "clientId" TEXT;

CREATE INDEX "clients_tenantId_idx" ON "clients"("tenantId");
CREATE INDEX "project_tasks_tenantId_idx" ON "project_tasks"("tenantId");
CREATE INDEX "project_tasks_projectId_idx" ON "project_tasks"("projectId");
CREATE INDEX "projects_clientId_idx" ON "projects"("clientId");

ALTER TABLE "clients"
  ADD CONSTRAINT "clients_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_tasks"
  ADD CONSTRAINT "project_tasks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_tasks"
  ADD CONSTRAINT "project_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
