-- CreateTable
CREATE TABLE "attendance_qr_displays" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "pairingCodeHash" TEXT,
    "pairingExpiresAt" TIMESTAMP(3),
    "verifyLocation" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "lastGeoLat" DOUBLE PRECISION,
    "lastGeoLng" DOUBLE PRECISION,
    "lastGeoAccuracy" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "registeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_qr_displays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_qr_displays_locationId_key" ON "attendance_qr_displays"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_qr_displays_tokenHash_key" ON "attendance_qr_displays"("tokenHash");

-- CreateIndex
CREATE INDEX "attendance_qr_displays_tenantId_idx" ON "attendance_qr_displays"("tenantId");

-- AddForeignKey
ALTER TABLE "attendance_qr_displays" ADD CONSTRAINT "attendance_qr_displays_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_qr_displays" ADD CONSTRAINT "attendance_qr_displays_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
