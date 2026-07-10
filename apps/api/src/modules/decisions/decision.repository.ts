import { prisma, type Prospect, type Verdict } from "@argus/database";

export interface ProspectInput {
  linkedInUrl: string;
  name: string;
  title?: string | undefined;
  companyName?: string | undefined;
  companyDomain?: string | undefined;
}

/** Prospect is a stable entity keyed by linkedInUrl (Bible §9.1 @unique). */
export async function upsertProspect(input: ProspectInput): Promise<Prospect> {
  return prisma.prospect.upsert({
    where: { linkedInUrl: input.linkedInUrl },
    create: {
      linkedInUrl: input.linkedInUrl,
      name: input.name,
      title: input.title,
      companyName: input.companyName,
      companyDomain: input.companyDomain,
    },
    update: {
      name: input.name,
      title: input.title,
      companyName: input.companyName,
      companyDomain: input.companyDomain,
    },
  });
}

export function getActiveIcp(teamId: string) {
  return prisma.iCPDefinition.findUnique({ where: { teamId, isActive: true } });
}

export function getCompanyMemory(teamId: string) {
  return prisma.companyMemory.findUnique({ where: { teamId } });
}

export function getUserPreferences(userId: string) {
  return prisma.userPreferences.findUnique({ where: { userId } });
}

/** Prior decisions for this exact prospect — feeds `{{historical_engagement}}`. */
export function getProspectDecisionHistory(prospectId: string, teamId: string) {
  return prisma.decision.findMany({
    where: { prospectId, teamId },
    include: { outcome: true, override: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

/** Recent team-wide outcomes — feeds `{{team_history}}` and `{{team_patterns}}`. */
export function getTeamOutcomeHistory(teamId: string) {
  return prisma.decision.findMany({
    where: { teamId, outcome: { isNot: null } },
    include: { outcome: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export interface CreateDecisionInput {
  userId: string;
  teamId: string;
  prospectId: string;
  verdict: Verdict;
  confidence: number;
  weightedScore: number;
  reasoning: string;
  recommendedAction: string;
  agentConsensus: string;
  agentOutputs: unknown;
  processingTimeMs: number;
  evidence: Array<{
    type: "FIRMOGRAPHIC" | "DEMOGRAPHIC" | "TECHNOGRAPHIC" | "INTENT" | "MARKET" | "HISTORICAL" | "DERIVED";
    source: "LINKEDIN" | "APOLLO" | "CLEARBIT" | "CRM" | "MANUAL" | "INFERRED" | "USER_INPUT";
    data: unknown;
    confidence: number;
  }>;
  message: {
    channel: "LINKEDIN" | "EMAIL" | "SLACK" | "OTHER";
    body: string;
    tone: string;
    personalizationHooks: unknown;
  } | null;
}

export function createDecisionRecord(input: CreateDecisionInput) {
  return prisma.decision.create({
    data: {
      userId: input.userId,
      teamId: input.teamId,
      prospectId: input.prospectId,
      verdict: input.verdict,
      confidence: input.confidence,
      weightedScore: input.weightedScore,
      reasoning: input.reasoning,
      recommendedAction: input.recommendedAction,
      agentConsensus: input.agentConsensus,
      agentOutputs: input.agentOutputs as never,
      processingTimeMs: input.processingTimeMs,
      evidence: {
        create: input.evidence.map((e) => ({
          type: e.type,
          source: e.source,
          data: e.data as never,
          confidence: e.confidence,
          prospect: { connect: { id: input.prospectId } },
        })),
      },
      ...(input.message
        ? {
            messageDrafts: {
              create: [
                {
                  userId: input.userId,
                  channel: input.message.channel,
                  body: input.message.body,
                  tone: input.message.tone,
                  personalizationHooks: input.message.personalizationHooks as never,
                },
              ],
            },
          }
        : {}),
    },
    include: { evidence: true, messageDrafts: true },
  });
}

export function findDecisionById(id: string, teamId: string) {
  return prisma.decision.findFirst({
    where: { id, teamId },
    include: {
      evidence: true,
      messageDrafts: true,
      outcome: true,
      override: true,
      prospect: true,
    },
  });
}

export async function createOverride(input: {
  decisionId: string;
  userId: string;
  originalVerdict: Verdict;
  newVerdict: Verdict;
  reason?: string | undefined;
}) {
  return prisma.override.create({
    data: {
      decisionId: input.decisionId,
      userId: input.userId,
      originalVerdict: input.originalVerdict,
      newVerdict: input.newVerdict,
      reason: input.reason,
    },
  });
}
