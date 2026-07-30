-- CreateTable
CREATE TABLE "ShadowDecision" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "weightedScore" DOUBLE PRECISION,
    "agentConsensus" TEXT,
    "recommendedAction" TEXT,
    "reasoning" TEXT NOT NULL,
    "controllerAction" TEXT NOT NULL,
    "controllerTargetCapability" TEXT,
    "controllerReasons" JSONB NOT NULL,
    "processingTimeMs" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "inferenceCostUsd" DOUBLE PRECISION NOT NULL,
    "agentOutputs" JSONB NOT NULL,
    "executionTrace" JSONB NOT NULL,
    "verdictAgreement" BOOLEAN NOT NULL,
    "confidenceDelta" INTEGER NOT NULL,
    "controllerComparisonApplicable" BOOLEAN NOT NULL,
    "disagreementCategories" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShadowDecision_decisionId_key" ON "ShadowDecision"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ShadowDecision_executionId_key" ON "ShadowDecision"("executionId");

-- CreateIndex
CREATE INDEX "ShadowDecision_teamId_idx" ON "ShadowDecision"("teamId");

-- CreateIndex
CREATE INDEX "ShadowDecision_prospectId_idx" ON "ShadowDecision"("prospectId");

-- CreateIndex
CREATE INDEX "ShadowDecision_createdAt_idx" ON "ShadowDecision"("createdAt");

-- CreateIndex
CREATE INDEX "ShadowDecision_teamId_createdAt_idx" ON "ShadowDecision"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "ShadowDecision_verdictAgreement_idx" ON "ShadowDecision"("verdictAgreement");

-- AddForeignKey
ALTER TABLE "ShadowDecision" ADD CONSTRAINT "ShadowDecision_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowDecision" ADD CONSTRAINT "ShadowDecision_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowDecision" ADD CONSTRAINT "ShadowDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowDecision" ADD CONSTRAINT "ShadowDecision_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
