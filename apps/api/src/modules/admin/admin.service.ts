import type {
  AdminListShadowDecisionsQuery,
  AdminListShadowDecisionsResponse,
  AdminShadowDecisionDetailResponse,
  AdminShadowHealthQuery,
  AdminShadowHealthResponse,
  AdminShadowMetricsQuery,
  AdminShadowMetricsResponse,
  AdminShadowRolloutAuditQuery,
  AdminShadowRolloutAuditResponse,
  AdminShadowRolloutPreviewResponse,
  AdminShadowRolloutResponse,
  UpdateShadowRolloutConfigRequest,
  UpsertShadowRolloutTeamOverrideRequest,
} from "@argus/shared";
import { getShadowMetricsSummary } from "../../agents/shadow-metrics.service.js";
import { getShadowCircuitBreakerState } from "../../agents/shadow-runner.service.js";
import { countShadowErrorsSince } from "../../agents/shadow-error-log.js";
import {
  getRolloutConfig,
  listTeamOverrides,
  deleteTeamOverride as deleteTeamOverrideRepo,
  listRolloutAuditEntries,
} from "../../agents/shadow-rollout.repository.js";
import {
  updateRolloutConfig,
  upsertTeamOverride as upsertTeamOverrideDomain,
  previewShadowSampling,
} from "../../agents/shadow-rollout.service.js";
import { env } from "../../config/env.js";
import { listShadowDecisions as listShadowDecisionsRepo, getShadowDecisionById, getLastShadowDecisionAt } from "./admin.repository.js";

export async function getShadowMetrics(query: AdminShadowMetricsQuery): Promise<AdminShadowMetricsResponse> {
  const summary = await getShadowMetricsSummary(query.teamId, query.sinceDays);
  return {
    scope: { teamId: query.teamId ?? null, sinceDays: query.sinceDays },
    ...summary,
  };
}

export async function listShadowDecisions(query: AdminListShadowDecisionsQuery): Promise<AdminListShadowDecisionsResponse> {
  const { rows, total } = await listShadowDecisionsRepo(query);
  return {
    data: rows.map((r) => ({
      id: r.id,
      teamId: r.teamId,
      teamName: r.team.name,
      decisionId: r.decisionId,
      prospectId: r.prospectId,
      shadowVerdict: r.verdict,
      shadowConfidence: r.confidence,
      shadowReasoning: r.reasoning,
      liveDecision: {
        verdict: r.decision.verdict,
        confidence: r.decision.confidence,
        reasoning: r.decision.reasoning,
        recommendedAction: r.decision.recommendedAction,
        createdAt: r.decision.createdAt.toISOString(),
      },
      verdictAgreement: r.verdictAgreement,
      confidenceDelta: r.confidenceDelta,
      disagreementCategories: r.disagreementCategories as AdminListShadowDecisionsResponse["data"][number]["disagreementCategories"],
      inferenceCostUsd: r.inferenceCostUsd,
      processingTimeMs: r.processingTimeMs,
      createdAt: r.createdAt.toISOString(),
    })),
    pagination: { total, limit: query.limit, offset: query.offset, hasMore: query.offset + rows.length < total },
  };
}

/** Returns null when no row matches -- the controller is responsible for
 *  turning that into a real 404, not this layer. */
export async function getShadowDecisionDetail(id: string): Promise<AdminShadowDecisionDetailResponse | null> {
  const r = await getShadowDecisionById(id);
  if (!r) return null;

  return {
    id: r.id,
    teamId: r.teamId,
    teamName: r.team.name,
    prospectId: r.prospectId,
    decisionId: r.decisionId,
    executionId: r.executionId,
    packId: r.packId,
    model: r.model,
    liveDecision: {
      verdict: r.decision.verdict,
      confidence: r.decision.confidence,
      weightedScore: r.decision.weightedScore,
      reasoning: r.decision.reasoning,
      recommendedAction: r.decision.recommendedAction,
      agentConsensus: r.decision.agentConsensus,
      agentOutputs: r.decision.agentOutputs,
      processingTimeMs: r.decision.processingTimeMs,
      inputTokens: r.decision.inputTokens,
      outputTokens: r.decision.outputTokens,
      inferenceCostUsd: r.decision.inferenceCostUsd,
      evidence: r.decision.evidence.map((e) => {
        const data = (e.data as { signal?: string; relevance?: string } | null) ?? {};
        return {
          id: e.id,
          type: e.type,
          signal: data.signal ?? "",
          relevance: data.relevance ?? "",
          confidence: e.confidence,
        };
      }),
      createdAt: r.decision.createdAt.toISOString(),
    },
    shadowDecision: {
      verdict: r.verdict,
      confidence: r.confidence,
      weightedScore: r.weightedScore,
      reasoning: r.reasoning,
      recommendedAction: r.recommendedAction,
      agentConsensus: r.agentConsensus,
      agentOutputs: r.agentOutputs,
      executionTrace: r.executionTrace,
      controllerAction: r.controllerAction,
      controllerTargetCapability: r.controllerTargetCapability,
      controllerReasons: r.controllerReasons as string[],
      processingTimeMs: r.processingTimeMs,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      inferenceCostUsd: r.inferenceCostUsd,
      createdAt: r.createdAt.toISOString(),
    },
    comparison: {
      verdictAgreement: r.verdictAgreement,
      confidenceDelta: r.confidenceDelta,
      controllerComparisonApplicable: r.controllerComparisonApplicable,
      disagreementCategories: r.disagreementCategories as AdminShadowDecisionDetailResponse["comparison"]["disagreementCategories"],
    },
  };
}

/** Gate 3 Increment 1.7/1.8 -- combines four real sources: the hard env
 *  kill switch (SHADOW_MODE_ENABLED), the DB-backed rollout config (soft
 *  kill switch + global percent, Increment 1.8), this apps/api instance's
 *  own live in-process state (circuit breaker state, the
 *  shadow-error-log ring buffer -- both per-process, not a cross-instance
 *  global view), and the ShadowDecision table. Reuses
 *  getShadowMetricsSummary's existing 24h-window aggregate for the
 *  agreement figure rather than a new hourly-granularity query.
 *
 *  `enabled` reflects whether shadow mode is ACTUALLY running for real
 *  traffic right now -- both the env AND the DB switch have to be on --
 *  not just one of the two, since either alone means nothing is sampled.
 *
 *  Revised after review: `globalPercent` is always the real global
 *  percent, never a per-team resolved "effective" percent -- this card
 *  represents cross-tenant system health, and showing one team's override
 *  as though it were "the" sampling rate would be ambiguous. Exceptions
 *  to the global rule are surfaced honestly instead, as a count
 *  (`activeOverrideCount`, unexpired overrides across ALL teams, not
 *  scoped to `query.teamId`) -- see the Rollout Controller page
 *  (`/admin/shadow-rollout`) for which teams and what percent. */
export async function getShadowHealth(query: AdminShadowHealthQuery): Promise<AdminShadowHealthResponse> {
  const [lastDecisionAt, metrics, rolloutConfig, overrides] = await Promise.all([
    getLastShadowDecisionAt(query.teamId),
    getShadowMetricsSummary(query.teamId, 1),
    getRolloutConfig(),
    listTeamOverrides(),
  ]);

  const now = new Date();
  const activeOverrideCount = overrides.filter((o) => !o.expiresAt || o.expiresAt > now).length;

  return {
    scope: { teamId: query.teamId ?? null },
    enabled: env.SHADOW_MODE_ENABLED && (rolloutConfig?.enabled ?? false),
    globalPercent: rolloutConfig?.globalPercent ?? 0,
    activeOverrideCount,
    circuitBreakerState: getShadowCircuitBreakerState(),
    lastDecisionAt: lastDecisionAt?.toISOString() ?? null,
    verdictAgreementRate24h: metrics.verdictAgreementRate,
    totalShadowDecisions24h: metrics.totalShadowDecisions,
    recentErrorCount1h: countShadowErrorsSince(60 * 60 * 1000),
  };
}

// Gate 3 Increment 1.8 -- Shadow Rollout Controller. These 6 functions are
// thin DTO-shaping wrappers over shadow-rollout.service.ts/.repository.ts,
// which own all real business logic and validation -- matching how
// getShadowMetrics above already just wraps getShadowMetricsSummary
// rather than reimplementing aggregation itself.

export async function getShadowRollout(): Promise<AdminShadowRolloutResponse> {
  const [config, overrides] = await Promise.all([getRolloutConfig(), listTeamOverrides()]);
  return {
    enabled: config?.enabled ?? false,
    globalPercent: config?.globalPercent ?? 0,
    version: config?.version ?? 0,
    teamOverrides: overrides.map((o) => ({
      teamId: o.teamId,
      teamName: o.team.name,
      percent: o.percent,
      version: o.version,
      reason: o.reason,
      expiresAt: o.expiresAt?.toISOString() ?? null,
      updatedAt: o.updatedAt.toISOString(),
      updatedBy: o.updatedBy,
    })),
  };
}

/** Returns {before, after} (both the domain rows, not DTOs) so the
 *  controller can build a real audit diff without an extra query. */
export function updateShadowRolloutConfig(input: UpdateShadowRolloutConfigRequest, updatedBy: string) {
  return updateRolloutConfig(input, updatedBy);
}

export function upsertShadowRolloutTeamOverride(teamId: string, input: UpsertShadowRolloutTeamOverrideRequest, updatedBy: string) {
  return upsertTeamOverrideDomain(teamId, input, updatedBy);
}

export function deleteShadowRolloutTeamOverride(teamId: string) {
  return deleteTeamOverrideRepo(teamId);
}

export async function getShadowRolloutAudit(query: AdminShadowRolloutAuditQuery): Promise<AdminShadowRolloutAuditResponse> {
  const before = query.before ? new Date(query.before) : undefined;
  const entries = await listRolloutAuditEntries(query.limit, before);
  const nextBefore = entries.length === query.limit ? (entries[entries.length - 1]?.createdAt.toISOString() ?? null) : null;

  return {
    entries: entries.map((e) => ({
      id: e.id,
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      actorId: e.actorId,
      beforeState: e.beforeState,
      afterState: e.afterState,
      createdAt: e.createdAt.toISOString(),
    })),
    nextBefore,
  };
}

export function previewShadowRollout(prospectId: string, teamId: string): Promise<AdminShadowRolloutPreviewResponse> {
  return previewShadowSampling(prospectId, teamId);
}
