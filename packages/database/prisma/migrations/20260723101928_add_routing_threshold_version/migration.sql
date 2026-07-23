-- CreateEnum
CREATE TYPE "RoutingThresholdStatus" AS ENUM ('ACTIVE', 'PENDING', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "RoutingThresholdVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "thresholds" JSONB NOT NULL,
    "status" "RoutingThresholdStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "RoutingThresholdVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoutingThresholdVersion_teamId_idx" ON "RoutingThresholdVersion"("teamId");

-- CreateIndex
CREATE INDEX "RoutingThresholdVersion_teamId_status_idx" ON "RoutingThresholdVersion"("teamId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingThresholdVersion_teamId_version_key" ON "RoutingThresholdVersion"("teamId", "version");

-- AddForeignKey
ALTER TABLE "RoutingThresholdVersion" ADD CONSTRAINT "RoutingThresholdVersion_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
