-- AlterTable
ALTER TABLE "employee_devices" ADD COLUMN     "bindingVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "challengeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "challengeNonce" TEXT,
ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "previousDeviceId" TEXT,
ADD COLUMN     "publicKey" TEXT,
ADD COLUMN     "publicKeyAlg" TEXT,
ADD COLUMN     "replacementAllowedById" TEXT,
ADD COLUMN     "replacementAllowedUntil" TIMESTAMP(3);
