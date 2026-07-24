-- CreateTable
CREATE TABLE "DecisionComplexityWeights" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "weights" JSONB NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "status" "RoutingThresholdStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "DecisionComplexityWeights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DecisionComplexityWeights_teamId_idx" ON "DecisionComplexityWeights"("teamId");

-- CreateIndex
CREATE INDEX "DecisionComplexityWeights_teamId_status_idx" ON "DecisionComplexityWeights"("teamId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionComplexityWeights_teamId_version_key" ON "DecisionComplexityWeights"("teamId", "version");

-- AddForeignKey
ALTER TABLE "DecisionComplexityWeights" ADD CONSTRAINT "DecisionComplexityWeights_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
