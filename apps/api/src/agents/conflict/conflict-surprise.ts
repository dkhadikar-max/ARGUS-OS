import { computeBaseConflict, scoreDirection, type BaseConflictResult, type ConflictInputScores } from "./conflict-detector.js";
import { CONFLICT_PAIRS, getHistoricalPairDisagreementRates } from "./pair-frequency.repository.js";

export interface PairSurprise {
  pair: [string, string];
  historicalRate: number;
  surprise: number;
  severity: "high" | "medium" | "low";
}

export interface ConflictSurpriseResult extends BaseConflictResult {
  pairSurprises: PairSurprise[];
  maxSurprise: number;
  avgSurprise: number;
  needsDebate: boolean;
  severity: "critical" | "high" | "medium" | "low";
}

/** Surprise = 1 - historicalRate: if a pair usually agrees (low historical
 *  disagreement rate) and they disagree now, that's surprising (high
 *  score). If a pair usually fights, the same disagreement is unremarkable
 *  (low score). Only computed for pairs that are actually disagreeing right
 *  now -- a pair with no current disagreement contributes no surprise. */
export function calculateSurpriseForPairs(
  scores: ConflictInputScores,
  historicalRates: Record<string, number>,
): { pairSurprises: PairSurprise[]; maxSurprise: number; avgSurprise: number } {
  const scoreByAgent: Record<string, number> = {
    icp: scores.icpScore,
    intent: scores.intentScore,
    risk: scores.riskSafetyScore,
  };

  const pairSurprises: PairSurprise[] = [];
  for (const [a, b] of CONFLICT_PAIRS) {
    const dirA = scoreDirection(scoreByAgent[a] ?? 50);
    const dirB = scoreDirection(scoreByAgent[b] ?? 50);
    const disagree = (dirA === "positive" && dirB === "negative") || (dirA === "negative" && dirB === "positive");
    if (!disagree) continue;

    const historicalRate = historicalRates[`${a}_${b}`] ?? 0.1;
    const surprise = 1 - historicalRate;
    pairSurprises.push({
      pair: [a, b],
      historicalRate,
      surprise,
      severity: surprise > 0.8 ? "high" : surprise > 0.5 ? "medium" : "low",
    });
  }

  const maxSurprise = pairSurprises.length > 0 ? Math.max(...pairSurprises.map((p) => p.surprise)) : 0;
  const avgSurprise =
    pairSurprises.length > 0 ? pairSurprises.reduce((sum, p) => sum + p.surprise, 0) / pairSurprises.length : 0;

  return { pairSurprises, maxSurprise, avgSurprise };
}

/**
 * v4 roadmap Phase 3 entry point: base conflict + historical surprise for
 * one team's current ICP/Intent/Risk scores. Not yet called from
 * orchestrator.ts or anywhere else in the live decision pipeline -- per
 * this phase's "no routing changes yet" scope, Routing Optimizer (Phase 7)
 * is the first real consumer.
 */
export async function calculateConflictSurprise(
  teamId: string,
  scores: ConflictInputScores,
): Promise<ConflictSurpriseResult> {
  const base = computeBaseConflict(scores);
  const historicalRates = await getHistoricalPairDisagreementRates(teamId);
  const { pairSurprises, maxSurprise, avgSurprise } = calculateSurpriseForPairs(scores, historicalRates);

  return {
    ...base,
    pairSurprises,
    maxSurprise,
    avgSurprise,
    needsDebate: base.cv > 0.25 || maxSurprise > 0.7 || base.directional,
    severity: maxSurprise > 0.9 ? "critical" : maxSurprise > 0.7 ? "high" : base.cv > 0.25 ? "medium" : "low",
  };
}
