import type {
  AdminListShadowDecisionsQuery,
  AdminListShadowDecisionsResponse,
  AdminShadowMetricsQuery,
  AdminShadowMetricsResponse,
} from "@argus/shared";
import { getShadowMetricsSummary } from "../../agents/shadow-metrics.service.js";
import { listShadowDecisions as listShadowDecisionsRepo } from "./admin.repository.js";

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
