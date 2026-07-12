-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SDR', 'AE', 'MANAGER', 'FOUNDER', 'ADMIN');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'STARTER', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('FIRMOGRAPHIC', 'DEMOGRAPHIC', 'TECHNOGRAPHIC', 'INTENT', 'MARKET', 'HISTORICAL', 'DERIVED');

-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('LINKEDIN', 'APOLLO', 'CLEARBIT', 'CRM', 'MANUAL', 'INFERRED', 'USER_INPUT');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('STRONG_YES', 'YES', 'WAIT', 'PASS', 'HARD_PASS');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('LINKEDIN', 'EMAIL', 'SLACK', 'OTHER');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('MESSAGE_SENT', 'MESSAGE_COPIED', 'CRM_UPDATED', 'MEETING_BOOKED', 'PASSED', 'SNOOZED', 'RESEARCHED_MORE');

-- CreateEnum
CREATE TYPE "OutcomeType" AS ENUM ('NO_RESPONSE', 'REPLIED_NO_MEETING', 'MEETING_BOOKED', 'OPPORTUNITY_CREATED', 'CLOSED_WON', 'CLOSED_LOST', 'DISQUALIFIED', 'SNOOZED');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('PENDING', 'CONNECTED', 'ERROR', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'SDR',
    "slackUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "teamId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "maxSeats" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "teamId" TEXT NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ICPDefinition" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "criteria" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "ICPDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyMemory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patterns" JSONB NOT NULL,
    "riskFlags" JSONB NOT NULL,
    "icpHistory" JSONB NOT NULL,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "CompanyMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyDefinition" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rules" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "PolicyDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "linkedInUrl" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "companyName" TEXT,
    "companyDomain" TEXT,
    "companySize" TEXT,
    "companyIndustry" TEXT,
    "companyFunding" TEXT,
    "location" TEXT,
    "rawProfile" JSONB,
    "enrichedData" JSONB,
    "vectorEmbedding" TEXT,
    "lastEnrichedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "source" "EvidenceSource" NOT NULL,
    "data" JSONB NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "prospectId" TEXT NOT NULL,
    "decisionId" TEXT,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentSignal" (
    "id" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT,
    "rawData" JSONB,
    "score" INTEGER NOT NULL DEFAULT 0,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "prospectId" TEXT NOT NULL,

    CONSTRAINT "IntentSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "weightedScore" DOUBLE PRECISION,
    "reasoning" TEXT NOT NULL,
    "recommendedAction" TEXT,
    "agentConsensus" TEXT,
    "agentOutputs" JSONB,
    "policyFlags" JSONB,
    "processingTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Override" (
    "id" TEXT NOT NULL,
    "originalVerdict" "Verdict" NOT NULL,
    "newVerdict" "Verdict" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,

    CONSTRAINT "Override_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageDraft" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "body" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "personalizationHooks" JSONB,
    "wasAccepted" BOOLEAN NOT NULL DEFAULT false,
    "wasEdited" BOOLEAN NOT NULL DEFAULT false,
    "editDiff" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,

    CONSTRAINT "MessageDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionTaken" (
    "id" TEXT NOT NULL,
    "actionType" "ActionType" NOT NULL,
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisionId" TEXT NOT NULL,

    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outcome" (
    "id" TEXT NOT NULL,
    "type" "OutcomeType" NOT NULL,
    "value" DOUBLE PRECISION,
    "timeToOutcomeDays" INTEGER,
    "feedback" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loggedBy" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Outcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL,
    "messageTone" TEXT NOT NULL DEFAULT 'professional',
    "messageLength" TEXT NOT NULL DEFAULT 'medium',
    "autoVerdict" BOOLEAN NOT NULL DEFAULT false,
    "sidebarPosition" TEXT NOT NULL DEFAULT 'right',
    "defaultChannel" "Channel" NOT NULL DEFAULT 'LINKEDIN',
    "digestFrequency" TEXT NOT NULL DEFAULT 'daily',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'PENDING',
    "config" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "beforeState" JSONB,
    "afterState" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_slackUserId_key" ON "User"("slackUserId");

-- CreateIndex
CREATE INDEX "User_teamId_idx" ON "User"("teamId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");

-- CreateIndex
CREATE INDEX "Team_slug_idx" ON "Team"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_teamId_idx" ON "ApiKey"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ICPDefinition_teamId_key" ON "ICPDefinition"("teamId");

-- CreateIndex
CREATE INDEX "ICPDefinition_teamId_idx" ON "ICPDefinition"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMemory_teamId_key" ON "CompanyMemory"("teamId");

-- CreateIndex
CREATE INDEX "CompanyMemory_teamId_idx" ON "CompanyMemory"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDefinition_teamId_key" ON "PolicyDefinition"("teamId");

-- CreateIndex
CREATE INDEX "PolicyDefinition_teamId_idx" ON "PolicyDefinition"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_linkedInUrl_key" ON "Prospect"("linkedInUrl");

-- CreateIndex
CREATE INDEX "Prospect_companyDomain_idx" ON "Prospect"("companyDomain");

-- CreateIndex
CREATE INDEX "Prospect_companyIndustry_idx" ON "Prospect"("companyIndustry");

-- CreateIndex
CREATE INDEX "Prospect_vectorEmbedding_idx" ON "Prospect"("vectorEmbedding");

-- CreateIndex
CREATE INDEX "Evidence_prospectId_idx" ON "Evidence"("prospectId");

-- CreateIndex
CREATE INDEX "Evidence_decisionId_idx" ON "Evidence"("decisionId");

-- CreateIndex
CREATE INDEX "Evidence_type_idx" ON "Evidence"("type");

-- CreateIndex
CREATE INDEX "IntentSignal_prospectId_idx" ON "IntentSignal"("prospectId");

-- CreateIndex
CREATE INDEX "IntentSignal_signalType_idx" ON "IntentSignal"("signalType");

-- CreateIndex
CREATE INDEX "IntentSignal_detectedAt_idx" ON "IntentSignal"("detectedAt");

-- CreateIndex
CREATE INDEX "Decision_userId_idx" ON "Decision"("userId");

-- CreateIndex
CREATE INDEX "Decision_teamId_idx" ON "Decision"("teamId");

-- CreateIndex
CREATE INDEX "Decision_prospectId_idx" ON "Decision"("prospectId");

-- CreateIndex
CREATE INDEX "Decision_verdict_idx" ON "Decision"("verdict");

-- CreateIndex
CREATE INDEX "Decision_createdAt_idx" ON "Decision"("createdAt");

-- CreateIndex
CREATE INDEX "Decision_userId_createdAt_idx" ON "Decision"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Override_decisionId_key" ON "Override"("decisionId");

-- CreateIndex
CREATE INDEX "Override_userId_idx" ON "Override"("userId");

-- CreateIndex
CREATE INDEX "Override_decisionId_idx" ON "Override"("decisionId");

-- CreateIndex
CREATE INDEX "MessageDraft_userId_idx" ON "MessageDraft"("userId");

-- CreateIndex
CREATE INDEX "MessageDraft_decisionId_idx" ON "MessageDraft"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionTaken_decisionId_key" ON "ActionTaken"("decisionId");

-- CreateIndex
CREATE INDEX "ActionTaken_decisionId_idx" ON "ActionTaken"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Outcome_decisionId_key" ON "Outcome"("decisionId");

-- CreateIndex
CREATE INDEX "Outcome_decisionId_idx" ON "Outcome"("decisionId");

-- CreateIndex
CREATE INDEX "Outcome_userId_idx" ON "Outcome"("userId");

-- CreateIndex
CREATE INDEX "Outcome_type_idx" ON "Outcome"("type");

-- CreateIndex
CREATE INDEX "Outcome_loggedAt_idx" ON "Outcome"("loggedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");

-- CreateIndex
CREATE INDEX "UserPreferences_userId_idx" ON "UserPreferences"("userId");

-- CreateIndex
CREATE INDEX "Integration_teamId_idx" ON "Integration"("teamId");

-- CreateIndex
CREATE INDEX "Integration_provider_idx" ON "Integration"("provider");

-- CreateIndex
CREATE INDEX "Webhook_teamId_idx" ON "Webhook"("teamId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICPDefinition" ADD CONSTRAINT "ICPDefinition_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMemory" ADD CONSTRAINT "CompanyMemory_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDefinition" ADD CONSTRAINT "PolicyDefinition_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentSignal" ADD CONSTRAINT "IntentSignal_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Override" ADD CONSTRAINT "Override_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Override" ADD CONSTRAINT "Override_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDraft" ADD CONSTRAINT "MessageDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDraft" ADD CONSTRAINT "MessageDraft_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
