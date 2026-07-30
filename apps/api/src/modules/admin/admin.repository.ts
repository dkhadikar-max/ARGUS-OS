import { prisma } from "@argus/database";
import type { AdminListShadowDecisionsQuery } from "@argus/shared";

/** Cross-tenant by design (Admin API Increment A) -- where.teamId is only
 *  present when the caller filtered to one team; omitted, this queries
 *  every team's ShadowDecision rows. */
export async function listShadowDecisions(query: AdminListShadowDecisionsQuery) {
  const where = {
    ...(query.teamId ? { teamId: query.teamId } : {}),
    ...(query.verdict ? { verdict: query.verdict } : {}),
    ...(query.verdictAgreement !== undefined ? { verdictAgreement: query.verdictAgreement } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.shadowDecision.findMany({
      where,
      // Deliberately excludes agentOutputs/executionTrace -- the heavy
      // PII-adjacent JSON blobs. No consumer for the full per-agent JSON
      // in this increment's scope (Decision Explorer, a later increment,
      // should fetch that per-row via a future detail endpoint, not bulk
      // in a paginated list). reasoning is a bounded string and the most
      // decision-relevant field for spotting shadow-mode quality issues,
      // so it stays.
      select: {
        id: true,
        teamId: true,
        team: { select: { name: true } },
        decisionId: true,
        prospectId: true,
        verdict: true,
        confidence: true,
        reasoning: true,
        verdictAgreement: true,
        confidenceDelta: true,
        disagreementCategories: true,
        inferenceCostUsd: true,
        processingTimeMs: true,
        createdAt: true,
        decision: {
          select: { verdict: true, confidence: true, reasoning: true, recommendedAction: true, createdAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: query.limit,
      skip: query.offset,
    }),
    prisma.shadowDecision.count({ where }),
  ]);

  return { rows, total };
}
