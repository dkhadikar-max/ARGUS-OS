import { AppError, type CreateDecisionRequest, type DecisionResponse, type OverrideDecisionRequest, type OverrideDecisionResponse } from "@argus/shared";
import type { AuthContext } from "../../middleware/auth.js";
import { runAgentDebate } from "../../agents/orchestrator.js";
import {
  createDecisionRecord,
  createOverride,
  findDecisionById,
  getActiveIcp,
  getCompanyMemory,
  getProspectDecisionHistory,
  getTeamOutcomeHistory,
  getUserPreferences,
  upsertProspect,
} from "./decision.repository.js";
import type { EvidenceType } from "@argus/database";

// Bible §8.3 classifies research data points as one of five lowercase
// strings ("firmographic, demographic, technographic, intent, or risk"),
// but the Prisma EvidenceType enum (§9.1) has no RISK member — it has
// MARKET / HISTORICAL / DERIVED instead, none of which the Research Agent
// ever emits. A bare `.toUpperCase()` cast would compile but throw at
// insert time the first time a "risk" data point appeared. "risk" maps to
// DERIVED here since a risk classification is itself an analytical
// judgment layered on top of raw evidence, not a raw signal type.
const RESEARCH_TYPE_TO_EVIDENCE_TYPE: Record<string, EvidenceType> = {
  firmographic: "FIRMOGRAPHIC",
  demographic: "DEMOGRAPHIC",
  technographic: "TECHNOGRAPHIC",
  intent: "INTENT",
  risk: "DERIVED",
};

function toDecisionResponse(
  decision: NonNullable<Awaited<ReturnType<typeof findDecisionById>>>,
): DecisionResponse {
  const primaryMessage = decision.messageDrafts[0];

  return {
    id: decision.id,
    status: "completed",
    verdict: decision.verdict,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    evidence: decision.evidence.map((e) => {
      const data = e.data as { signal?: string; relevance?: string };
      return {
        id: e.id,
        type: e.type,
        signal: data.signal ?? "",
        relevance: data.relevance ?? "",
        confidence: e.confidence,
      };
    }),
    message: {
      linkedin: primaryMessage?.channel === "LINKEDIN" ? primaryMessage.body : null,
      email: primaryMessage?.channel === "EMAIL" ? primaryMessage.body : null,
      tone: (primaryMessage?.tone as DecisionResponse["message"]["tone"]) ?? "professional",
      personalizationHooks: (primaryMessage?.personalizationHooks as string[]) ?? [],
    },
    recommendedAction:
      (decision.recommendedAction as DecisionResponse["recommendedAction"]) ?? "research_more",
    processingTimeMs: decision.processingTimeMs ?? 0,
    createdAt: decision.createdAt.toISOString(),
    updatedAt: decision.updatedAt.toISOString(),
    outcome: decision.outcome
      ? { id: decision.outcome.id, type: decision.outcome.type, loggedAt: decision.outcome.loggedAt.toISOString() }
      : null,
    override: decision.override
      ? { id: decision.override.id, newVerdict: decision.override.newVerdict, reason: decision.override.reason }
      : null,
  };
}

export async function createDecision(
  request: CreateDecisionRequest,
  auth: AuthContext,
): Promise<DecisionResponse> {
  const prospect = await upsertProspect(request.prospect);

  const [icp, companyMemory, userPreferences, prospectHistory, teamHistory] =
    await Promise.all([
      getActiveIcp(request.context.teamId),
      getCompanyMemory(request.context.teamId),
      getUserPreferences(request.context.userId),
      getProspectDecisionHistory(prospect.id, request.context.teamId),
      getTeamOutcomeHistory(request.context.teamId),
    ]);

  const { output, processingTimeMs } = await runAgentDebate({
    prospectData: {
      profile: { name: prospect.name, title: prospect.title, linkedInUrl: prospect.linkedInUrl },
      company: {
        name: prospect.companyName,
        domain: prospect.companyDomain,
        size: prospect.companySize,
        industry: prospect.companyIndustry,
        funding: prospect.companyFunding,
      },
      rawProfile: prospect.rawProfile,
      enrichedData: prospect.enrichedData,
    },
    teamIcp: icp?.criteria ?? null,
    companyMemory: companyMemory
      ? { patterns: companyMemory.patterns, riskFlags: companyMemory.riskFlags }
      : null,
    intentSignals: prospect.rawProfile,
    historicalEngagement: prospectHistory.map((d) => ({
      verdict: d.verdict,
      outcome: d.outcome?.type ?? null,
      createdAt: d.createdAt,
    })),
    teamHistory: teamHistory.map((d) => ({ verdict: d.verdict, outcome: d.outcome?.type })),
    userPreferences: userPreferences ?? null,
    teamPatterns: companyMemory?.patterns ?? null,
  });

  const decision = await createDecisionRecord({
    userId: request.context.userId,
    teamId: request.context.teamId,
    prospectId: prospect.id,
    verdict: output.judge.verdict,
    confidence: output.judge.confidence,
    weightedScore: output.judge.weighted_score,
    reasoning: output.judge.reasoning,
    recommendedAction: output.judge.recommended_action,
    agentConsensus: output.judge.agent_consensus,
    agentOutputs: output,
    processingTimeMs,
    evidence: output.research.data_points.map((dp) => ({
      type: RESEARCH_TYPE_TO_EVIDENCE_TYPE[dp.type] ?? "DERIVED",
      source: "INFERRED",
      data: { signal: dp.signal, relevance: dp.relevance },
      confidence: output.research.confidence,
    })),
    message: request.options.generateMessage
      ? {
          channel: request.options.messageChannel,
          body:
            request.options.messageChannel === "EMAIL"
              ? output.judge.message.email ?? output.judge.message.linkedin
              : output.judge.message.linkedin,
          tone: output.judge.message.tone,
          personalizationHooks: output.judge.message.personalization_hooks,
        }
      : null,
  });

  const full = await findDecisionById(decision.id, request.context.teamId);
  if (!full) {
    throw new AppError("NOT_FOUND", "Decision could not be retrieved after creation");
  }
  return toDecisionResponse(full);
}

export async function getDecision(
  id: string,
  auth: AuthContext,
): Promise<DecisionResponse> {
  const decision = await findDecisionById(id, auth.teamId);
  if (!decision) {
    throw new AppError("NOT_FOUND", "Decision not found");
  }
  return toDecisionResponse(decision);
}

export async function overrideDecision(
  id: string,
  request: OverrideDecisionRequest,
  auth: AuthContext,
): Promise<OverrideDecisionResponse> {
  if (!auth.userId) {
    throw new AppError("FORBIDDEN", "Only authenticated users can override a decision");
  }

  const decision = await findDecisionById(id, auth.teamId);
  if (!decision) {
    throw new AppError("NOT_FOUND", "Decision not found");
  }
  if (decision.override) {
    throw new AppError("DECISION_STALE", "Decision has already been overridden");
  }

  const override = await createOverride({
    decisionId: id,
    userId: auth.userId,
    originalVerdict: decision.verdict,
    newVerdict: request.newVerdict,
    reason: request.reason,
  });

  return {
    id: decision.id,
    originalVerdict: override.originalVerdict,
    newVerdict: override.newVerdict,
    reason: override.reason,
    overrideId: override.id,
    createdAt: override.createdAt.toISOString(),
  };
}
