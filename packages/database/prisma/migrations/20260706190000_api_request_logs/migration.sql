CREATE TABLE "api_request_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "authType" TEXT NOT NULL,
    "subjectId" TEXT,
    "apiKeyId" TEXT,
    "oauthClientId" TEXT,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "responseMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_request_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "api_request_logs"
  ADD CONSTRAINT "api_request_logs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "api_request_logs"
  ADD CONSTRAINT "api_request_logs_apiKeyId_fkey"
  FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "api_request_logs"
  ADD CONSTRAINT "api_request_logs_oauthClientId_fkey"
  FOREIGN KEY ("oauthClientId") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "api_request_logs_tenantId_idx" ON "api_request_logs"("tenantId");
CREATE INDEX "api_request_logs_apiKeyId_idx" ON "api_request_logs"("apiKeyId");
CREATE INDEX "api_request_logs_oauthClientId_idx" ON "api_request_logs"("oauthClientId");
