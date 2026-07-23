import { agentDebateOutputSchema, AppError, scoreToVerdict, type AgentDebateOutput, type CreateActionRequest, type CreateActionResponse, type CreateDecisionRequest, type DecisionResponse, type EditMessageDraftRequest, type EditMessageDraftResponse, type OverrideDecisionRequest, type OverrideDecisionResponse, type PolicyFlag, type ShareDecisionResponse } from "@argus/shared";
import type { AuthContext } from "../../middleware/auth.js";
import { runAgentDebate } from "../../agents/orchestrator.js";
import { calculateDecisionValue, calculateInferenceCostUsd, calculateValueCostRatio } from "../../agents/decision-value.service.js";
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
  updateMessageDraft,
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
import { getPolicy } from "../policy/policy.repository.js";
import { evaluatePolicyRules } from "../policy/policy.service.js";
import { getRecentOverrideCounts } from "../outcomes/outcome.repository.js";
import { logger } from "../../lib/logger.js";
import { getTeam } from "../teams/team.repository.js";

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

  if (enrichment.person) {
    const { seniority, emailStatus } = enrichment.person;
    const parts = [
      seniority ? `Seniority: ${seniority}` : null,
      emailStatus ? `Email ${emailStatus}` : null,
    ].filter((part): part is string => Boolean(part));

    if (parts.length > 0) {
      evidence.push({
        type: "DEMOGRAPHIC",
        source: "APOLLO",
        data: { signal: parts.join(" · "), relevance: "Verified person-level details from Apollo.io" },
        confidence: ENRICHMENT_EVIDENCE_CONFIDENCE,
      });
    }
  }

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

// The judge legitimately returns a null linkedin (and/or email) draft when
// recommended_action is "pass_and_move_on" -- there's nothing worth sending.
// MessageDraft.body is a non-nullable DB column, so this falls back to
// whichever channel actually has content, and returns null (same as
// generateMessage: false) only when neither does, rather than ever handing
// createDecisionRecord a null body.
function buildMessageDraft(
  request: CreateDecisionRequest,
  output: AgentDebateOutput,
): { channel: "LINKEDIN" | "EMAIL"; body: string; tone: string; personalizationHooks: unknown } | null {
  if (!request.options.generateMessage) return null;

  const { linkedin, email, tone, personalization_hooks: personalizationHooks } = output.judge.message;
  const preferredChannel: Array<["LINKEDIN" | "EMAIL", string | null]> =
    request.options.messageChannel === "EMAIL"
      ? [["EMAIL", email], ["LINKEDIN", linkedin]]
      : [["LINKEDIN", linkedin], ["EMAIL", email]];

  for (const [channel, body] of preferredChannel) {
    if (body) return { channel, body, tone, personalizationHooks };
  }
  return null;
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
    policyFlags: (decision.policyFlags as PolicyFlag[] | null) ?? [],
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
  const [enrichment, icp, companyMemory, userPreferences, prospectHistory, teamHistory, policy, team] =
    await Promise.all([
      enrichProspect(upsertedProspect),
      getActiveIcp(request.context.teamId),
      getCompanyMemory(request.context.teamId),
      getUserPreferences(request.context.userId),
      getProspectDecisionHistory(upsertedProspect.id, request.context.teamId),
      getTeamOutcomeHistory(request.context.teamId),
      // Policy v2.1 L4 Policy Engine (not the Bible -- see policy.service.ts)
      // -- fetched alongside everything else this decision needs, evaluated
      // once the debate's verdict/confidence are known below.
      getPolicy(request.context.teamId),
      // Team.companyContext (not the Bible -- see schema.prisma's comment):
      // the judge agent's drafted messages need to know what the seller's
      // company actually sells, same reasoning as everything else in this
      // Promise.all.
      getTeam(request.context.teamId),
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
  // v4 roadmap Phase 2 (Decision Value) -- 0/0 on a cache hit is accurate,
  // not a placeholder: no new API call was made, so there's genuinely no
  // new inference cost for this request.
  let usage = { inputTokens: 0, outputTokens: 0 };

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
      companyContext: team?.companyContext ?? null,
    });
    output = debate.output;
    processingTimeMs = debate.processingTimeMs;
    usage = debate.usage;
    await setCachedDebateOutput(prospect.id, request.context.teamId, icpVersion, output);
  }

  // Bible §8.7 maps weightedScore to verdict via fixed bands, and the Judge
  // agent is asked to compute both fields itself -- but live testing found
  // it can mislabel the verdict against its own weightedScore (e.g.
  // weightedScore 28, squarely in the 0-29 HARD_PASS band, labeled PASS
  // instead). Deriving verdict from weightedScore here removes that whole
  // class of drift regardless of why the model gets its own label wrong.
  const verdict = scoreToVerdict(output.judge.weighted_score);

  // Policy v2.1's "Policy Check" gate: evaluated against this decision's
  // own verdict/confidence/prospect title -- same on a cache hit or a fresh
  // debate, since the policy is about the *result*, not how it was computed.
  const policyFlags = evaluatePolicyRules((policy?.rules as never) ?? [], {
    verdict,
    confidence: output.judge.confidence,
    prospectTitle: prospect.title,
  });

  // v4 roadmap Phase 2 (Decision Value) -- computed once here with
  // outcomeType: null (revenue/fp/fn all require an outcome that doesn't
  // exist yet; only time_saved contributes at creation time), then
  // recomputed by outcome.service.ts once a real outcome is logged.
  const inferenceCostUsd = calculateInferenceCostUsd(usage.inputTokens, usage.outputTokens);
  const decisionValue = calculateDecisionValue({ verdict, outcomeType: null });
  const valueCostRatio = calculateValueCostRatio(decisionValue.decisionValueUsd, inferenceCostUsd);

  const decision = await createDecisionRecord({
    userId: request.context.userId,
    teamId: request.context.teamId,
    prospectId: prospect.id,
    verdict,
    confidence: output.judge.confidence,
    weightedScore: output.judge.weighted_score,
    reasoning: output.judge.reasoning,
    recommendedAction: output.judge.recommended_action,
    agentConsensus: output.judge.agent_consensus,
    agentOutputs: output,
    policyFlags,
    processingTimeMs,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    inferenceCostUsd,
    decisionValueUsd: decisionValue.decisionValueUsd,
    valueCostRatio,
    evidence: [
      ...output.research.data_points.map((dp) => ({
        type: RESEARCH_TYPE_TO_EVIDENCE_TYPE[dp.type] ?? "DERIVED",
        source: "INFERRED" as const,
        data: { signal: dp.signal, relevance: dp.relevance },
        confidence: output.research.confidence,
      })),
      ...buildEnrichmentEvidence(enrichment),
    ],
    message: buildMessageDraft(request, output),
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

// ARGUS Unanimous Policy v2.1 "Override Rate Guardrail" (not the Bible):
// "If override rate exceeds 40%, trigger emergency prompt review within 24
// hours." A rolling window, not all-time (see outcome.repository.ts's
// getRecentOverrideCounts), so a real recent quality problem isn't diluted
// by a team's whole history. Requires a minimum sample size first -- a
// brand-new team's first override would otherwise be a 100% "rate" that
// means nothing, the same reasoning Company Memory's riskFlags already
// applies (a minimum of 3 occurrences before calling something recurring).
const OVERRIDE_RATE_GUARDRAIL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const OVERRIDE_RATE_GUARDRAIL_THRESHOLD = 0.4;
const OVERRIDE_RATE_GUARDRAIL_MIN_SAMPLE = 10;

/** Alerts the team's Slack channel exactly once per crossing -- computed as
 *  "the rate before this override" vs. "the rate after", so it fires only
 *  on the override that actually pushes the team over 40%, not on every
 *  subsequent override while already above it. Best-effort: a Slack
 *  failure here must never fail the override the rep just made. */
async function checkOverrideRateGuardrail(teamId: string, meta?: RequestMeta): Promise<void> {
  const since = new Date(Date.now() - OVERRIDE_RATE_GUARDRAIL_WINDOW_MS);
  const { total, overridden } = await getRecentOverrideCounts(teamId, since);
  if (total < OVERRIDE_RATE_GUARDRAIL_MIN_SAMPLE) return;

  const rateAfter = overridden / total;
  const rateBefore = (overridden - 1) / total;
  if (rateBefore > OVERRIDE_RATE_GUARDRAIL_THRESHOLD || rateAfter <= OVERRIDE_RATE_GUARDRAIL_THRESHOLD) {
    return;
  }

  await recordAudit({
    entityType: "policy_guardrail",
    entityId: teamId,
    action: "override_rate_exceeded",
    actorId: "system",
    afterState: { rate: rateAfter, total, overridden, windowDays: 7 },
    meta,
  });

  const slack = await resolveSlackTeamByArgusTeamId(teamId).catch(() => null);
  if (!slack) return;

  await postSlackMessage(
    slack.botToken,
    slack.alertChannelId,
    `⚠️ *Policy Guardrail:* Override rate hit ${Math.round(rateAfter * 100)}% over the last 7 days (${overridden}/${total} decisions) — Policy v2.1 requires an emergency prompt review within 24 hours.`,
  ).catch((err) => {
    logger.warn({ err, teamId }, "Override rate guardrail Slack alert failed; audit entry still recorded");
  });
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

  await checkOverrideRateGuardrail(auth.teamId, meta).catch((err) => {
    logger.warn({ err, teamId: auth.teamId }, "Override rate guardrail check failed; override itself still recorded");
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

  // Policy v2.1's Governor Model: Decision Engine -> Policy Check -> Human
  // Approval -> execution tools. "Human Approval (V1: required)" is already
  // how every action here works (nothing sends automatically) -- a BLOCK
  // flag is the one case where even the human's own approval isn't enough,
  // so it's enforced here, at the last point before an action is recorded,
  // rather than only surfaced as a warning the rep could click past.
  if (request.actionType === "MESSAGE_SENT" || request.actionType === "MESSAGE_COPIED") {
    const blockingFlag = ((decision.policyFlags as PolicyFlag[] | null) ?? []).find(
      (flag) => flag.action === "BLOCK",
    );
    if (blockingFlag) {
      throw new AppError("VALIDATION_ERROR", `Blocked by policy: ${blockingFlag.message}`);
    }
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

  try {
    await postSlackMessage(slack.botToken, slack.alertChannelId, text);
  } catch (err) {
    // A team that's connected Slack can still fail here later (a revoked
    // bot token, a deleted alert channel) -- surfaced as the same typed,
    // actionable error as the "not connected at all" check above, rather
    // than an unhandled exception falling through to a generic 500.
    throw new AppError(
      "VALIDATION_ERROR",
      "Couldn't post to Slack -- check that ARGUS is still connected to your team's Slack workspace",
      undefined,
      { cause: err instanceof Error ? err.message : String(err) },
    );
  }

  await recordAudit({
    entityType: "decision",
    entityId: id,
    action: "shared",
    actorId: auth.userId,
    meta,
  });

  return { shared: true, channelId: slack.alertChannelId };
}

/** Bible §9.1 models MessageDraft.wasEdited/editDiff, but §10 never
 *  contracts an endpoint to write them -- until now, both surfaces that
 *  let a rep edit a message (the LinkedIn sidebar's MessageComposer,
 *  Slack's "Edit First" modal) tracked the edit locally with nowhere to
 *  send it. Persists against `messageDrafts[0]`, the one primary draft
 *  createDecisionRecord ever creates for a decision (the same draft
 *  toDecisionResponse's `message` field already reflects). */
export async function editMessageDraft(
  id: string,
  request: EditMessageDraftRequest,
  auth: AuthContext,
  meta?: RequestMeta,
): Promise<EditMessageDraftResponse> {
  if (!auth.userId) {
    throw new AppError("FORBIDDEN", "Only authenticated users can edit a decision's message");
  }

  const decision = await findDecisionById(id, auth.teamId);
  if (!decision) {
    throw new AppError("NOT_FOUND", "Decision not found");
  }

  const draft = decision.messageDrafts[0];
  if (!draft) {
    throw new AppError("VALIDATION_ERROR", "No message draft exists for this decision");
  }

  // Capture the original, pre-edit text once on the first edit; a later
  // re-edit leaves editDiff pointing at that same original rather than the
  // previous edit, so it always reads as "first-known-good vs current".
  const editDiff = draft.wasEdited ? draft.editDiff : draft.body;

  const updated = await updateMessageDraft({
    draftId: draft.id,
    body: request.body,
    editDiff,
  });

  await recordAudit({
    entityType: "decision",
    entityId: id,
    action: "message_edited",
    actorId: auth.userId,
    meta,
  });

  return {
    id: updated.id,
    decisionId: id,
    body: updated.body,
    wasEdited: updated.wasEdited,
    editDiff: updated.editDiff,
  };
}
