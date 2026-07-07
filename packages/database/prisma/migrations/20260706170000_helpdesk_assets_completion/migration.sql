-- Allow escalated tickets
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'ESCALATED';

ALTER TABLE "tickets"
ADD COLUMN IF NOT EXISTS "escalatedTo" TEXT,
ADD COLUMN IF NOT EXISTS "escalatedAt" TIMESTAMP(3);

CREATE TABLE "helpdesk_sla_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" "TicketPriority",
    "responseHours" INTEGER,
    "resolutionHours" INTEGER NOT NULL,
    "assigneeQueue" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "helpdesk_sla_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_base_articles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "sourceType" TEXT NOT NULL DEFAULT 'ARTICLE',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_base_articles_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "assets"
ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

CREATE TABLE "asset_documents" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "helpdesk_sla_rules_tenantId_category_idx" ON "helpdesk_sla_rules"("tenantId", "category");
CREATE INDEX "knowledge_base_articles_tenantId_status_idx" ON "knowledge_base_articles"("tenantId", "status");
CREATE INDEX "knowledge_base_articles_tenantId_category_idx" ON "knowledge_base_articles"("tenantId", "category");
CREATE INDEX "asset_documents_assetId_idx" ON "asset_documents"("assetId");
CREATE INDEX "asset_documents_tenantId_idx" ON "asset_documents"("tenantId");

ALTER TABLE "helpdesk_sla_rules" ADD CONSTRAINT "helpdesk_sla_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_base_articles" ADD CONSTRAINT "knowledge_base_articles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_documents" ADD CONSTRAINT "asset_documents_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_documents" ADD CONSTRAINT "asset_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
