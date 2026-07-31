import type {
  AdminListShadowDecisionsQuery,
  AdminListShadowDecisionsResponse,
  AdminShadowDecisionDetailResponse,
  AdminShadowMetricsQuery,
  AdminShadowMetricsResponse,
} from "@argus/shared";
import { getShadowMetricsSummary } from "../../agents/shadow-metrics.service.js";
import { listShadowDecisions as listShadowDecisionsRepo, getShadowDecisionById } from "./admin.repository.js";

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
