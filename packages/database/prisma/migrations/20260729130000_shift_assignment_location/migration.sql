-- AlterTable
ALTER TABLE "shift_assignments" ADD COLUMN "locationId" TEXT;

-- CreateIndex
CREATE INDEX "shift_assignments_locationId_idx" ON "shift_assignments"("locationId");

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
