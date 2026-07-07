-- P1 talent depth: structured interview scorecards, goal key results, and review questionnaires.
ALTER TABLE "interviews" ADD COLUMN "scorecard" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "goals" ADD COLUMN "keyResults" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "review_cycles" ADD COLUMN "questions" JSONB NOT NULL DEFAULT '[]';
