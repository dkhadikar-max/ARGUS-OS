import { prisma, type Evidence } from "@argus/database";
import { sourceQuality } from "./scoring.js";
import type { Retriever } from "./types.js";

/** There's no dedicated "risk_signal" EvidenceType in the real schema
 *  (only FIRMOGRAPHIC/DEMOGRAPHIC/TECHNOGRAPHIC/INTENT/MARKET/HISTORICAL/
 *  DERIVED) -- risk-relevant facts like "hiring freeze reported" are
 *  tagged DERIVED, matching the exact convention packages/database/prisma/
 *  seed.ts already uses ({ type: "DERIVED", source: "INFERRED", signal:
 *  "Company announced a hiring freeze 3 weeks ago" }). MARKET is included
 *  too for competitive/funding-shift signals that read as risk factors. */
const RISK_TYPES: Evidence["type"][] = ["DERIVED", "MARKET"];

/** Corroboration count is capped and normalized to 0-1 (3+ corroborating
 *  edges maxes out the term) rather than left as a raw integer -- an
 *  unbounded count would let corroboration dominate the weighted sum
 *  arbitrarily against the 0-1 confidence/source-quality terms. */
const MAX_CORROBORATIONS_COUNTED = 3;

/** Prioritizes corroboration (via Phase 2's EvidenceEdge) and confidence
 *  over source quality -- a single-source risk signal that's corroborated
 *  by another piece of evidence is more trustworthy than an isolated one,
 *  regardless of which source either came from. */
export class RiskRetriever implements Retriever {
  async retrieve(evidencePool: Evidence[], topK = 5): Promise<Evidence[]> {
    const candidates = evidencePool.filter((e) => RISK_TYPES.includes(e.type));
    if (candidates.length === 0) return [];

    const edges = await prisma.evidenceEdge.findMany({
      where: { toId: { in: candidates.map((e) => e.id) }, relation: "CORROBORATES" },
    });
    const corroborationCounts = new Map<string, number>();
    for (const edge of edges) {
      corroborationCounts.set(edge.toId, (corroborationCounts.get(edge.toId) ?? 0) + 1);
    }

    return candidates
      .map((e) => {
        const corroborations = Math.min(corroborationCounts.get(e.id) ?? 0, MAX_CORROBORATIONS_COUNTED);
        return {
          evidence: e,
          score:
            (corroborations / MAX_CORROBORATIONS_COUNTED) * 0.4 +
            (e.confidence / 100) * 0.3 +
            sourceQuality(e.source) * 0.3,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => s.evidence);
  }
}
