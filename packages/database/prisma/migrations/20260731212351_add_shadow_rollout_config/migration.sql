-- CreateTable
CREATE TABLE "ShadowRolloutConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'SHADOW_ROLLOUT',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "globalPercent" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowRolloutConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowRolloutTeamOverride" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowRolloutTeamOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShadowRolloutConfig_key_key" ON "ShadowRolloutConfig"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ShadowRolloutTeamOverride_teamId_key" ON "ShadowRolloutTeamOverride"("teamId");

-- CreateIndex
CREATE INDEX "ShadowRolloutTeamOverride_teamId_idx" ON "ShadowRolloutTeamOverride"("teamId");

-- AddForeignKey
ALTER TABLE "ShadowRolloutTeamOverride" ADD CONSTRAINT "ShadowRolloutTeamOverride_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
