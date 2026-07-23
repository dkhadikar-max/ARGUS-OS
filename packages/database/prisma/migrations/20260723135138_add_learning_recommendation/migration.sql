-- CreateEnum
CREATE TYPE "LearningRecommendationSubsystem" AS ENUM ('ICP', 'PROMPTS', 'ROUTING_THRESHOLD', 'RETRIEVER_WEIGHT', 'POLICY');

-- CreateEnum
CREATE TYPE "LearningRecommendationStatus" AS ENUM ('PENDING', 'ACTIONED', 'DISMISSED');

-- CreateTable
CREATE TABLE "LearningRecommendation" (
    "id" TEXT NOT NULL,
    "targetSubsystem" "LearningRecommendationSubsystem" NOT NULL,
    "rationale" TEXT NOT NULL,
    "suggestedChange" JSONB,
    "status" "LearningRecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "LearningRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearningRecommendation_teamId_idx" ON "LearningRecommendation"("teamId");

-- CreateIndex
CREATE INDEX "LearningRecommendation_teamId_status_idx" ON "LearningRecommendation"("teamId", "status");

-- AddForeignKey
ALTER TABLE "LearningRecommendation" ADD CONSTRAINT "LearningRecommendation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
