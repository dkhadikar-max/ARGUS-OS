-- AlterTable
ALTER TABLE "Decision" ADD COLUMN     "decisionValueUsd" DOUBLE PRECISION,
ADD COLUMN     "inferenceCostUsd" DOUBLE PRECISION,
ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "outputTokens" INTEGER,
ADD COLUMN     "valueCostRatio" DOUBLE PRECISION;
