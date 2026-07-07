-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "geoAccuracy" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "employee_devices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT,
    "platform" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_devices_employeeId_key" ON "employee_devices"("employeeId");

-- CreateIndex
CREATE INDEX "employee_devices_tenantId_idx" ON "employee_devices"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_devices_tenantId_deviceId_key" ON "employee_devices"("tenantId", "deviceId");

-- AddForeignKey
ALTER TABLE "employee_devices" ADD CONSTRAINT "employee_devices_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
