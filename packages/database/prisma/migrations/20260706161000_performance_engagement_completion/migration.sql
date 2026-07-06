-- Module 10: Performance, Goals, OKRs, and Reviews
CREATE TABLE "performance_check_ins" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "managerId" TEXT,
    "goalId" TEXT,
    "checkInDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ON_TRACK',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "blockers" TEXT,
    "nextSteps" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_check_ins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "one_on_ones" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "agenda" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "actionItems" JSONB NOT NULL DEFAULT '[]',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "one_on_ones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "competency_frameworks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "competencies" JSONB NOT NULL DEFAULT '[]',
    "ratingScale" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competency_frameworks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_calibrations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reviewCycleId" TEXT NOT NULL,
    "revieweeId" TEXT NOT NULL,
    "calibratedById" TEXT,
    "previousRating" DOUBLE PRECISION,
    "calibratedRating" DOUBLE PRECISION NOT NULL,
    "performanceBand" TEXT,
    "potential" TEXT,
    "promotionRecommendation" TEXT,
    "pipRecommendation" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_calibrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "promotion_recommendations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reviewCycleId" TEXT,
    "currentRole" TEXT,
    "recommendedRole" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECOMMENDED',
    "reason" TEXT NOT NULL,
    "recommendedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_improvement_plans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reviewCycleId" TEXT,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "successCriteria" JSONB NOT NULL DEFAULT '[]',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_improvement_plans_pkey" PRIMARY KEY ("id")
);

-- Module 11: Engagement, Culture, Surveys, and Recognition
ALTER TABLE "survey_responses"
ADD COLUMN "respondentHash" TEXT,
ADD COLUMN "segment" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "anonymous_feedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "message" TEXT NOT NULL,
    "sentiment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anonymous_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "performance_check_ins_tenantId_employeeId_idx" ON "performance_check_ins"("tenantId", "employeeId");
CREATE INDEX "performance_check_ins_goalId_idx" ON "performance_check_ins"("goalId");
CREATE INDEX "one_on_ones_tenantId_employeeId_idx" ON "one_on_ones"("tenantId", "employeeId");
CREATE INDEX "one_on_ones_managerId_idx" ON "one_on_ones"("managerId");
CREATE INDEX "competency_frameworks_tenantId_isActive_idx" ON "competency_frameworks"("tenantId", "isActive");
CREATE UNIQUE INDEX "performance_calibrations_reviewCycleId_revieweeId_key" ON "performance_calibrations"("reviewCycleId", "revieweeId");
CREATE INDEX "performance_calibrations_tenantId_idx" ON "performance_calibrations"("tenantId");
CREATE INDEX "promotion_recommendations_tenantId_employeeId_idx" ON "promotion_recommendations"("tenantId", "employeeId");
CREATE INDEX "performance_improvement_plans_tenantId_employeeId_idx" ON "performance_improvement_plans"("tenantId", "employeeId");
CREATE UNIQUE INDEX "survey_responses_surveyId_respondentHash_key" ON "survey_responses"("surveyId", "respondentHash");
CREATE INDEX "anonymous_feedback_tenantId_status_idx" ON "anonymous_feedback"("tenantId", "status");

ALTER TABLE "performance_check_ins" ADD CONSTRAINT "performance_check_ins_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_check_ins" ADD CONSTRAINT "performance_check_ins_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "performance_check_ins" ADD CONSTRAINT "performance_check_ins_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "one_on_ones" ADD CONSTRAINT "one_on_ones_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "one_on_ones" ADD CONSTRAINT "one_on_ones_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "competency_frameworks" ADD CONSTRAINT "competency_frameworks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_calibrations" ADD CONSTRAINT "performance_calibrations_reviewCycleId_fkey" FOREIGN KEY ("reviewCycleId") REFERENCES "review_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_calibrations" ADD CONSTRAINT "performance_calibrations_revieweeId_fkey" FOREIGN KEY ("revieweeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotion_recommendations" ADD CONSTRAINT "promotion_recommendations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promotion_recommendations" ADD CONSTRAINT "promotion_recommendations_reviewCycleId_fkey" FOREIGN KEY ("reviewCycleId") REFERENCES "review_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "performance_improvement_plans" ADD CONSTRAINT "performance_improvement_plans_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_improvement_plans" ADD CONSTRAINT "performance_improvement_plans_reviewCycleId_fkey" FOREIGN KEY ("reviewCycleId") REFERENCES "review_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "anonymous_feedback" ADD CONSTRAINT "anonymous_feedback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
