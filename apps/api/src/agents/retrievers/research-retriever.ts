import type { Evidence } from "@argus/database";
import { recencyScore, sourceQuality } from "./scoring.js";
import type { Retriever } from "./types.js";

/** Research Agent (Bible §8.3) wants broad firmographic/company context --
 *  the real EvidenceType enum's closest fit to the architecture doc's
 *  "revenue/funding/company_size" examples, plus MARKET and HISTORICAL for
 *  broader context the doc's own pseudocode didn't have a real-schema
 *  equivalent for. */
const RESEARCH_TYPES: Evidence["type"][] = ["FIRMOGRAPHIC", "DEMOGRAPHIC", "TECHNOGRAPHIC", "MARKET", "HISTORICAL"];

/** Prioritizes confidence and recency equally, source quality less --
 *  Research synthesizes many data points into one narrative, so a
 *  moderately-reliable-but-fresh signal is still useful alongside a
 *  highly-reliable-but-stale one. */
export class ResearchRetriever implements Retriever {
  async retrieve(evidencePool: Evidence[], topK = 8): Promise<Evidence[]> {
    return evidencePool
      .filter((e) => RESEARCH_TYPES.includes(e.type))
      .map((e) => ({
        evidence: e,
        score: (e.confidence / 100) * 0.4 + recencyScore(e.extractedAt) * 0.4 + sourceQuality(e.source) * 0.2,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => s.evidence);
  }
}
