import type { Evidence } from "@argus/database";
import { recencyScore, sourceQuality } from "./scoring.js";
import type { Retriever } from "./types.js";

/** ICP criteria (companySize, companyIndustry, companyFunding, title --
 *  icp.repository.ts's ICP_FIELD_OPTIONS) are all firmographic/
 *  demographic/technographic facts, not time-sensitive signals. The
 *  architecture doc's own ICPRetriever example scores a
 *  "historical_win_rate(evidence.type)" term this codebase has no data
 *  source for (Company Memory tracks win rate by *verdict*, not by
 *  evidence *type* -- fabricating that number here would be exactly the
 *  kind of guess this session's discipline avoids), so it's left out
 *  rather than invented. */
const ICP_TYPES: Evidence["type"][] = ["FIRMOGRAPHIC", "TECHNOGRAPHIC", "DEMOGRAPHIC"];

/** Prioritizes confidence heavily since ICP fit is a factual match/
 *  mismatch, not a time-sensitive read; recency matters less than for
 *  Research or Intent since a company's size/industry rarely changes. */
export class ICPRetriever implements Retriever {
  async retrieve(evidencePool: Evidence[], topK = 5): Promise<Evidence[]> {
    return evidencePool
      .filter((e) => ICP_TYPES.includes(e.type))
      .map((e) => ({
        evidence: e,
        score: (e.confidence / 100) * 0.5 + recencyScore(e.extractedAt) * 0.3 + sourceQuality(e.source) * 0.2,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => s.evidence);
  }
}
