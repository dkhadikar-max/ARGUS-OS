import { prisma } from "@argus/database";
import { agentDebateOutputSchema } from "@argus/shared";
import { getHistoricalPairDisagreementRates } from "../conflict/pair-frequency.repository.js";
import { classifyVerdictCorrectness, extractComplexityFeatures, type LabeledDecision } from "./decision-complexity.js";

/**
 * v4 roadmap Phase 12 -- pulls every one of a team's decisions that has a
 * logged outcome, reusing Decision.agentOutputs (same "already persisted
 * for every decision" data source pair-frequency.repository.ts's
 * getHistoricalPairDisagreementRates reads) rather than requiring a new
 * column to store conflict features -- cv/directional/maxSurprise are all
 * recomputable retroactively from the same icp/intent/risk scores already
 * on every decision.
 *
 * Simplification, stated plainly: historicalPairRates is computed once,
 * as of now, and applied to every historical decision's maxSurprise
 * calculation -- not reconstructed as of each decision's own creation
 * time. A full point-in-time reconstruction would need to replay history
 * one decision at a time, which isn't warranted for a bootstrapping weight
 * recompute.
 */
export async function getLabeledDecisionsForTeam(teamId: string): Promise<LabeledDecision[]> {
  const [decisions, historicalPairRates] = await Promise.all([
    prisma.decision.findMany({
      where: { teamId, outcome: { isNot: null } },
      select: { verdict: true, agentOutputs: true, outcome: { select: { type: true } } },
    }),
    getHistoricalPairDisagreementRates(teamId),
  ]);

  const labeled: LabeledDecision[] = [];
  for (const decision of decisions) {
    if (!decision.outcome) continue; // narrows the type; the query already filters for this

    const correctness = classifyVerdictCorrectness(decision.verdict, decision.outcome.type);
    if (correctness === "ambiguous") continue;

    const parsed = agentDebateOutputSchema.safeParse(decision.agentOutputs);
    if (!parsed.success) continue; // pre-agentOutputs-column decisions, or malformed legacy rows

    const { icp, intent, risk } = parsed.data;
    const features = extractComplexityFeatures(
      { icpScore: icp.score, intentScore: intent.score, riskSafetyScore: 100 - risk.time_waste_probability },
      historicalPairRates,
    );
    labeled.push({ correctness, features });
  }

  return labeled;
}
