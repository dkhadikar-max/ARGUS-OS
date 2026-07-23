-- CreateEnum
CREATE TYPE "EvidenceEdgeRelation" AS ENUM ('CORROBORATES', 'CONTRADICTS', 'ENABLES', 'PRECEDES');

-- CreateTable
CREATE TABLE "EvidenceEdge" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "relation" "EvidenceEdgeRelation" NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenceEdge_fromId_idx" ON "EvidenceEdge"("fromId");

-- CreateIndex
CREATE INDEX "EvidenceEdge_toId_idx" ON "EvidenceEdge"("toId");

-- CreateIndex
CREATE INDEX "EvidenceEdge_relation_idx" ON "EvidenceEdge"("relation");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceEdge_fromId_toId_relation_key" ON "EvidenceEdge"("fromId", "toId", "relation");

-- AddForeignKey
ALTER TABLE "EvidenceEdge" ADD CONSTRAINT "EvidenceEdge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceEdge" ADD CONSTRAINT "EvidenceEdge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
