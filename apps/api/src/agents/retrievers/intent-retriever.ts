import type { Evidence } from "@argus/database";
import { recencyScore, sourceQuality } from "./scoring.js";
import type { Retriever } from "./types.js";

const INTENT_TYPES: Evidence["type"][] = ["INTENT"];

/** Prioritizes recency heavily -- "intent decays fast" is the architecture
 *  doc's own framing, and matches Bible §8.5's constraint that Intent
 *  signals older than 90 days count 0.5x. Confidence and source quality
 *  both matter less here than for Research/ICP: a fresh, moderately-
 *  confident intent signal (e.g. a scraped LinkedIn post) still beats a
 *  stale, highly-confident one. */
export class IntentRetriever implements Retriever {
  async retrieve(evidencePool: Evidence[], topK = 5): Promise<Evidence[]> {
    return evidencePool
      .filter((e) => INTENT_TYPES.includes(e.type))
      .map((e) => ({
        evidence: e,
        score: recencyScore(e.extractedAt) * 0.5 + (e.confidence / 100) * 0.3 + sourceQuality(e.source) * 0.2,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => s.evidence);
  }
}
