-- Attendance capture mode configuration for tenant and optional location overrides.
CREATE TYPE "AttendanceCaptureMode" AS ENUM (
  'WEB',
  'MOBILE',
  'GPS',
  'QR',
  'BIOMETRIC',
  'MANUAL',
  'API_IMPORT'
);

CREATE TABLE "attendance_capture_settings" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "locationId" TEXT,
  "mode" "AttendanceCaptureMode" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "requiresGps" BOOLEAN NOT NULL DEFAULT false,
  "requiresGeofence" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "attendance_capture_settings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attendance_capture_settings_tenantId_idx" ON "attendance_capture_settings"("tenantId");
CREATE INDEX "attendance_capture_settings_locationId_idx" ON "attendance_capture_settings"("locationId");
CREATE UNIQUE INDEX "attendance_capture_settings_tenant_location_mode_key"
  ON "attendance_capture_settings"("tenantId", "locationId", "mode");
CREATE UNIQUE INDEX "attendance_capture_settings_tenant_default_mode_key"
  ON "attendance_capture_settings"("tenantId", "mode")
  WHERE "locationId" IS NULL;

ALTER TABLE "attendance_capture_settings"
  ADD CONSTRAINT "attendance_capture_settings_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_capture_settings"
  ADD CONSTRAINT "attendance_capture_settings_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
