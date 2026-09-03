-- Lets an admin decline a pending sensitive profile change (bank details, PAN, etc.)
-- instead of only approving it, so rejected requests stop showing as pending.
ALTER TABLE "employee_profile_changes" ADD COLUMN "rejectedById" TEXT;
ALTER TABLE "employee_profile_changes" ADD COLUMN "rejectedAt" TIMESTAMP(3);
