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

/** Single-row detail, full agentOutputs/executionTrace on both sides --
 *  the cost of the heavy JSON only applies to the one row someone actually
 *  opened, unlike listShadowDecisions' deliberately narrow select. */
export async function getShadowDecisionById(id: string) {
  return prisma.shadowDecision.findUnique({
    where: { id },
    select: {
      id: true,
      teamId: true,
      team: { select: { name: true } },
      prospectId: true,
      decisionId: true,
      executionId: true,
      packId: true,
      model: true,
      verdict: true,
      confidence: true,
      weightedScore: true,
      reasoning: true,
      recommendedAction: true,
      agentConsensus: true,
      agentOutputs: true,
      executionTrace: true,
      controllerAction: true,
      controllerTargetCapability: true,
      controllerReasons: true,
      processingTimeMs: true,
      inputTokens: true,
      outputTokens: true,
      inferenceCostUsd: true,
      verdictAgreement: true,
      confidenceDelta: true,
      controllerComparisonApplicable: true,
      disagreementCategories: true,
      createdAt: true,
      decision: {
        select: {
          verdict: true,
          confidence: true,
          weightedScore: true,
          reasoning: true,
          recommendedAction: true,
          agentConsensus: true,
          agentOutputs: true,
          processingTimeMs: true,
          inputTokens: true,
          outputTokens: true,
          inferenceCostUsd: true,
          createdAt: true,
          evidence: { select: { id: true, type: true, data: true, confidence: true } },
        },
      },
    },
  });
}

/** Gate 3 Increment 1.7 -- the Shadow Health card's "Last decision"
 *  field. Returns null when no shadow decisions exist yet for the given
 *  scope, rather than throwing or defaulting to a fabricated date. */
export async function getLastShadowDecisionAt(teamId?: string): Promise<Date | null> {
  const row = await prisma.shadowDecision.findFirst({
    where: teamId ? { teamId } : {},
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

/** Gate 3 Increment 1.9 -- the Shadow Health Dashboard's error-rate
 *  denominator (successes + errors attempted in the window). Global
 *  only, no teamId -- this page's fields are process-wide by design. */
export async function countShadowDecisionsSince(since: Date): Promise<number> {
  return prisma.shadowDecision.count({ where: { createdAt: { gte: since } } });
}
