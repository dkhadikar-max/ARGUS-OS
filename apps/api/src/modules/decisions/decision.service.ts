import { agentDebateOutputSchema, AppError, type CreateActionRequest, type CreateActionResponse, type CreateDecisionRequest, type DecisionResponse, type OverrideDecisionRequest, type OverrideDecisionResponse, type ShareDecisionResponse } from "@argus/shared";
import type { AuthContext } from "../../middleware/auth.js";
import { runAgentDebate } from "../../agents/orchestrator.js";
import {
  createActionTaken,
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
import { publishTeamEvent } from "../../lib/pubsub.js";
import { getCachedDebateOutput, setCachedDebateOutput } from "../../lib/decision-cache.js";
import { track } from "../../lib/analytics.js";
import { enrichProspect, type EnrichmentResult } from "../../lib/enrichment/enrichment.service.js";
import { recordAudit, type RequestMeta } from "../../lib/audit.js";
import { resolveSlackTeamByArgusTeamId } from "../integrations/integration.service.js";
import { postSlackMessage } from "../../lib/slack-client.js";

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

// Real firmographic data from a paid provider is materially more trustworthy
// than an LLM's inference from a scraped LinkedIn page — 90 vs the
// Research Agent's own self-reported confidence (frequently lower when data
// is sparse). Bible §9.1's EvidenceSource enum has APOLLO/CLEARBIT members
// specifically for this (§18 AI-2).
const ENRICHMENT_EVIDENCE_CONFIDENCE = 90;

function buildEnrichmentEvidence(
  enrichment: EnrichmentResult,
): Array<{
  type: EvidenceType;
  source: "APOLLO" | "CLEARBIT";
  data: { signal: string; relevance: string };
  confidence: number;
}> {
  const evidence: ReturnType<typeof buildEnrichmentEvidence> = [];

  if (enrichment.apollo) {
    const { industry, estimatedNumEmployees, totalFunding } = enrichment.apollo;
    const parts = [
      industry ? `Industry: ${industry}` : null,
      estimatedNumEmployees != null ? `${estimatedNumEmployees} employees` : null,
      totalFunding != null ? `$${totalFunding.toLocaleString("en-US")} total funding` : null,
    ].filter((part): part is string => Boolean(part));

    if (parts.length > 0) {
      evidence.push({
        type: "FIRMOGRAPHIC",
        source: "APOLLO",
        data: { signal: parts.join(" · "), relevance: "Company firmographics from Apollo.io" },
        confidence: ENRICHMENT_EVIDENCE_CONFIDENCE,
      });
    }
  }

  if (enrichment.clearbit) {
    const { industry, employees, raised } = enrichment.clearbit;
    const parts = [
      industry ? `Industry: ${industry}` : null,
      employees != null ? `${employees} employees` : null,
      raised != null ? `$${raised.toLocaleString("en-US")} raised` : null,
    ].filter((part): part is string => Boolean(part));

    if (parts.length > 0) {
      evidence.push({
        type: "FIRMOGRAPHIC",
        source: "CLEARBIT",
        data: { signal: parts.join(" · "), relevance: "Company firmographics from Clearbit" },
        confidence: ENRICHMENT_EVIDENCE_CONFIDENCE,
      });
    }
  }

  return evidence;
}

// `agentOutputs` is a `Json?` column (schema.prisma: "Full agent outputs for
// audit") -- always written by createDecision below, but still untyped at
// the DB layer, so this parses defensively rather than trusting the cast
// the write side uses. A decision predating this field (or any malformed
// row) degrades to no debate section rather than a 500 on GET.
function parseDebate(agentOutputs: unknown): DecisionResponse["debate"] {
  const parsed = agentDebateOutputSchema.safeParse(agentOutputs);
  return parsed.success ? parsed.data : null;
}

function toDecisionResponse(
  decision: NonNullable<Awaited<ReturnType<typeof findDecisionById>>>,
  includeDebate: boolean,
): DecisionResponse {
  const primaryMessage = decision.messageDrafts[0];

  return {
    id: decision.id,
    status: "completed",
    prospect: {
      name: decision.prospect.name,
      title: decision.prospect.title,
      companyName: decision.prospect.companyName,
      linkedInUrl: decision.prospect.linkedInUrl,
    },
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
    debate: includeDebate ? parseDebate(decision.agentOutputs) : undefined,
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
    actionTaken: decision.actionTaken
      ? {
          id: decision.actionTaken.id,
          actionType: decision.actionTaken.actionType,
          timestamp: decision.actionTaken.timestamp.toISOString(),
        }
      : null,
  };
}

export async function createDecision(
  request: CreateDecisionRequest,
  auth: AuthContext,
  meta?: RequestMeta,
): Promise<DecisionResponse> {
  const upsertedProspect = await upsertProspect(request.prospect);

  // Bible §18 AI-2: Apollo/Clearbit enrichment runs before the agent debate
  // so the Research Agent gets real firmographics, not just whatever the
  // LinkedIn content script scraped. No-ops (and stays cheap) once a
  // prospect was enriched within the last 30 days — see enrichment.service.ts.
  const [enrichment, icp, companyMemory, userPreferences, prospectHistory, teamHistory] =
    await Promise.all([
      enrichProspect(upsertedProspect),
      getActiveIcp(request.context.teamId),
      getCompanyMemory(request.context.teamId),
      getUserPreferences(request.context.userId),
      getProspectDecisionHistory(upsertedProspect.id, request.context.teamId),
      getTeamOutcomeHistory(request.context.teamId),
    ]);
  const prospect = enrichment.prospect;

  // Bible §18 AI-5 / §9.2: skip the expensive Claude call (§13.1: ~$0.04-
  // 0.06 and several seconds) if nothing has changed for this prospect
  // since the last identical request. Keyed on the *current* ICP version,
  // so an ICP edit is a cache miss rather than serving a stale verdict.
  const icpVersion = icp?.version ?? "none";
  const cacheStartedAt = Date.now();
  let output = await getCachedDebateOutput(prospect.id, request.context.teamId, icpVersion);
  let processingTimeMs: number;

  if (output) {
    processingTimeMs = Date.now() - cacheStartedAt;
  } else {
    const debate = await runAgentDebate({
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
    output = debate.output;
    processingTimeMs = debate.processingTimeMs;
    await setCachedDebateOutput(prospect.id, request.context.teamId, icpVersion, output);
  }

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
    evidence: [
      ...output.research.data_points.map((dp) => ({
        type: RESEARCH_TYPE_TO_EVIDENCE_TYPE[dp.type] ?? "DERIVED",
        source: "INFERRED" as const,
        data: { signal: dp.signal, relevance: dp.relevance },
        confidence: output.research.confidence,
      })),
      ...buildEnrichmentEvidence(enrichment),
    ],
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

  await publishTeamEvent(request.context.teamId, {
    type: "decision.created",
    data: {
      decisionId: full.id,
      teamId: request.context.teamId,
      userId: request.context.userId,
      prospectName: full.prospect.name,
      verdict: full.verdict,
      confidence: full.confidence,
      timestamp: full.createdAt.toISOString(),
    },
  });

  // Bible §19.1 Data Integrity: "Audit logs capture all state changes".
  // Decisions are immutable after creation (no separate "updated" audit
  // entry is possible for this entityType — Override/Outcome are their own
  // audited entities below).
  await recordAudit({
    entityType: "decision",
    entityId: full.id,
    action: "created",
    actorId: request.context.userId,
    afterState: {
      verdict: full.verdict,
      confidence: full.confidence,
      recommendedAction: full.recommendedAction,
    },
    meta,
  });

  // Bible §11.1 verdict_generated: "AI returns verdict" — fires whenever a
  // verdict reaches the requesting surface, whether freshly computed or
  // served from the AI-5 cache; the funnels in §11.2 measure the rep
  // reaching a verdict, not whether Claude happened to be called this time.
  track(request.context.userId, {
    name: "verdict_generated",
    properties: {
      decision_id: full.id,
      verdict: full.verdict,
      confidence: full.confidence,
      processing_time_ms: processingTimeMs,
      agent_consensus: full.agentConsensus ?? "unknown",
    },
  });

  return toDecisionResponse(full, request.options.includeDebate);
}

export async function getDecision(
  id: string,
  auth: AuthContext,
): Promise<DecisionResponse> {
  const decision = await findDecisionById(id, auth.teamId);
  if (!decision) {
    throw new AppError("NOT_FOUND", "Decision not found");
  }
  // Always include the debate here: this GET is specifically what "View
  // More" / deep inspection calls (Bible §6.5), unlike POST's initial,
  // deliberately leaner response.
  return toDecisionResponse(decision, true);
}

export async function overrideDecision(
  id: string,
  request: OverrideDecisionRequest,
  auth: AuthContext,
  meta?: RequestMeta,
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

  track(auth.userId, {
    name: "verdict_overridden",
    properties: {
      decision_id: decision.id,
      original_verdict: override.originalVerdict,
      new_verdict: override.newVerdict,
      reason: override.reason,
    },
  });

  // Bible §19.1: "Override records preserve original verdict" (the Override
  // model itself does that) + "Audit logs capture all state changes" (this
  // does, as the generic cross-entity trail Override doesn't replace).
  await recordAudit({
    entityType: "decision",
    entityId: decision.id,
    action: "overridden",
    actorId: auth.userId,
    beforeState: { verdict: override.originalVerdict },
    afterState: { verdict: override.newVerdict, reason: override.reason },
    meta,
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

/** Bible §5.1/§5.2 Action Graph, §9.1 ActionTaken (@unique decisionId — one
 *  per decision, the same 1:1 shape as Override/Outcome). §10 never
 *  contracts a REST endpoint for this; inferred from the sibling
 *  override/outcome endpoints §10.2/§10.3 do. */
export async function recordAction(
  id: string,
  request: CreateActionRequest,
  auth: AuthContext,
  meta?: RequestMeta,
): Promise<CreateActionResponse> {
  if (!auth.userId) {
    throw new AppError("FORBIDDEN", "Only authenticated users can record a decision action");
  }

  const decision = await findDecisionById(id, auth.teamId);
  if (!decision) {
    throw new AppError("NOT_FOUND", "Decision not found");
  }
  if (decision.actionTaken) {
    throw new AppError("DECISION_STALE", "An action has already been recorded for this decision");
  }

  const actionTaken = await createActionTaken({
    decisionId: id,
    actionType: request.actionType,
    details: request.details,
  });

  await recordAudit({
    entityType: "decision",
    entityId: id,
    action: "action_recorded",
    actorId: auth.userId,
    afterState: { actionType: actionTaken.actionType },
    meta,
  });

  return {
    id: actionTaken.id,
    decisionId: id,
    actionType: actionTaken.actionType,
    details: (actionTaken.details as Record<string, unknown> | null) ?? null,
    timestamp: actionTaken.timestamp.toISOString(),
  };
}

/** Bible §6.5 Full Debate View's "[Share with Team]" button. §10 never
 *  contracts this endpoint (same gap ActionTaken had before it got one) --
 *  posts a plain-text summary to the team's connected Slack channel, the
 *  one shared team-wide surface (Bible §7.1). Throws a clear, specific
 *  error when the team hasn't connected Slack, rather than a generic
 *  failure -- there's nowhere else "the team" could mean today. */
export async function shareDecision(
  id: string,
  auth: AuthContext,
  meta?: RequestMeta,
): Promise<ShareDecisionResponse> {
  if (!auth.userId) {
    throw new AppError("FORBIDDEN", "Only authenticated users can share a decision");
  }

  const decision = await findDecisionById(id, auth.teamId);
  if (!decision) {
    throw new AppError("NOT_FOUND", "Decision not found");
  }

  const slack = await resolveSlackTeamByArgusTeamId(auth.teamId);
  if (!slack) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Connect Slack (Settings > Integrations) before sharing a decision with your team",
    );
  }

  const text = [
    `*${decision.prospect.name}*${decision.prospect.title ? `, ${decision.prospect.title}` : ""}${decision.prospect.companyName ? ` @ ${decision.prospect.companyName}` : ""}`,
    `Verdict: *${decision.verdict}* (${decision.confidence}% confidence)`,
    decision.reasoning,
  ].join("\n");

  await postSlackMessage(slack.botToken, slack.alertChannelId, text);

  await recordAudit({
    entityType: "decision",
    entityId: id,
    action: "shared",
    actorId: auth.userId,
    meta,
  });

  return { shared: true, channelId: slack.alertChannelId };
}
