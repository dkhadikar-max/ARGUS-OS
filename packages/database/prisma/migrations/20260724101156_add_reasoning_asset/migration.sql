-- CreateEnum
CREATE TYPE "ReasoningAssetType" AS ENUM ('POLICY', 'EVIDENCE', 'THRESHOLD', 'PROMPT', 'RETRIEVER', 'STRATEGY', 'PATTERN');

-- CreateTable
CREATE TABLE "ReasoningAsset" (
    "id" TEXT NOT NULL,
    "assetType" "ReasoningAssetType" NOT NULL,
    "assetKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ownerId" TEXT,
    "effectivenessScore" DOUBLE PRECISION,
    "lastEvaluatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teamId" TEXT,

    CONSTRAINT "ReasoningAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReasoningAsset_teamId_idx" ON "ReasoningAsset"("teamId");

-- CreateIndex
CREATE INDEX "ReasoningAsset_assetType_idx" ON "ReasoningAsset"("assetType");

-- CreateIndex
CREATE UNIQUE INDEX "ReasoningAsset_assetType_assetKey_teamId_key" ON "ReasoningAsset"("assetType", "assetKey", "teamId");

-- AddForeignKey
ALTER TABLE "ReasoningAsset" ADD CONSTRAINT "ReasoningAsset_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
