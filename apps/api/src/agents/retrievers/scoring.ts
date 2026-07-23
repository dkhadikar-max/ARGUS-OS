import type { EvidenceSource } from "@argus/database";

/** v4 roadmap Phase 4 -- shared ranking helpers every retriever draws on.
 *  Both functions are deliberate judgment calls (not derived from any Bible
 *  or data source), documented here so they're a visible, adjustable
 *  policy rather than buried magic numbers. */

const RECENCY_HALF_LIFE_DAYS = 90;

/** 1.0 for evidence extracted right now, decaying linearly to 0 at 90 days
 *  old. Matches Bible §8.3's own "signals from last 90 days weighted 2x"
 *  recency framing for the Research Agent, reused here as a general
 *  default rather than inventing a different window per retriever. */
export function recencyScore(extractedAt: Date, now: Date = new Date()): number {
  const daysSince = (now.getTime() - extractedAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, 1 - daysSince / RECENCY_HALF_LIFE_DAYS);
}

/** Reliability ranking by source: CRM (first-party, verified) highest;
 *  paid enrichment (Apollo/Clearbit) and human-entered data next; scraped
 *  LinkedIn profile data lower (unverified, rep-facing UI can be wrong);
 *  INFERRED (heuristic-derived, e.g. "example.com domain implies test
 *  record") lowest, since it's a guess rather than an observation. */
const SOURCE_QUALITY: Record<EvidenceSource, number> = {
  CRM: 1.0,
  APOLLO: 0.85,
  CLEARBIT: 0.85,
  USER_INPUT: 0.8,
  MANUAL: 0.8,
  LINKEDIN: 0.6,
  INFERRED: 0.4,
};

export function sourceQuality(source: EvidenceSource): number {
  return SOURCE_QUALITY[source];
}
