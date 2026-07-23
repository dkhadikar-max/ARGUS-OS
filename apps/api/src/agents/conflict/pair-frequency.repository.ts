import { prisma } from "@argus/database";
import { agentDebateOutputSchema } from "@argus/shared";
import { scoreDirection } from "./conflict-detector.js";

/** The 3 well-defined-direction agent pairs (see conflict-detector.ts for
 *  why Research is excluded). Keyed as "a_b" strings for use as a plain
 *  Record key throughout this module. */
export const CONFLICT_PAIRS: Array<[string, string]> = [
  ["icp", "intent"],
  ["icp", "risk"],
  ["intent", "risk"],
];

function pairKey(a: string, b: string): string {
  return `${a}_${b}`;
}

/** Neutral prior when a team has no (or too little) history for a pair --
 *  matches the architecture doc's own fallback (`pair_frequencies.get(pair,
 *  0.10)`). Per the roadmap's Phase 0 production checklist, 200+
 *  disagreements is the point real pair-frequency data becomes meaningful;
 *  below that this prior keeps the surprise score from overreacting to a
 *  brand-new team's tiny sample. */
const DEFAULT_DISAGREEMENT_RATE = 0.1;

const HISTORY_LIMIT = 500;

/**
 * How often, historically, does each agent pair disagree for this team?
 * Reads Decision.agentOutputs (already persisted for every decision, "Full
 * agent outputs for audit" -- schema.prisma's own comment) rather than
 * requiring a schema change to support this. Two agents "disagree" here
 * using the exact same scoreDirection() threshold as the live conflict
 * check, so historical rate and current disagreement are computed the same
 * way.
 */
export async function getHistoricalPairDisagreementRates(teamId: string): Promise<Record<string, number>> {
  const decisions = await prisma.decision.findMany({
    where: { teamId },
    select: { agentOutputs: true },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });

  const counts = new Map<string, { disagree: number; total: number }>();
  for (const [a, b] of CONFLICT_PAIRS) counts.set(pairKey(a, b), { disagree: 0, total: 0 });

  for (const decision of decisions) {
    const parsed = agentDebateOutputSchema.safeParse(decision.agentOutputs);
    if (!parsed.success) continue; // pre-agentOutputs-column decisions, or malformed legacy rows

    const { icp, intent, risk } = parsed.data;
    const scores: Record<string, number> = {
      icp: icp.score,
      intent: intent.score,
      risk: 100 - risk.time_waste_probability,
    };

    for (const [a, b] of CONFLICT_PAIRS) {
      const key = pairKey(a, b);
      const entry = counts.get(key);
      if (!entry) continue;
      entry.total += 1;
      const dirA = scoreDirection(scores[a] ?? 50);
      const dirB = scoreDirection(scores[b] ?? 50);
      if ((dirA === "positive" && dirB === "negative") || (dirA === "negative" && dirB === "positive")) {
        entry.disagree += 1;
      }
    }
  }

  const rates: Record<string, number> = {};
  for (const [key, entry] of counts) {
    rates[key] = entry.total > 0 ? entry.disagree / entry.total : DEFAULT_DISAGREEMENT_RATE;
  }
  return rates;
}
