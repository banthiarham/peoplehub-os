CREATE TABLE "approval_request_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "status" "ApprovalStatus",
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_request_history_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "approval_request_history"
  ADD CONSTRAINT "approval_request_history_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_request_history"
  ADD CONSTRAINT "approval_request_history_approvalRequestId_fkey"
  FOREIGN KEY ("approvalRequestId") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "approval_request_history_tenantId_idx" ON "approval_request_history"("tenantId");
CREATE INDEX "approval_request_history_approvalRequestId_idx" ON "approval_request_history"("approvalRequestId");
