-- Records the scheduled working date a comp-off grant was explicitly used against.
-- Set together with status: USED; null for every other status.
ALTER TABLE "comp_off_grants" ADD COLUMN "usedOnDate" DATE;
