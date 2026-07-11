import type { CompanyMemoryResponse } from "@argus/shared";
import { getCompanyMemory } from "./memory.repository.js";

// Shape actually written by outcome.service.ts's updateCompanyMemoryPattern
// -- an internal representation, distinct from (and mapped below to) Bible
// §10.5's public response shape.
interface InternalPattern {
  verdict: string;
  description: string;
  sampleSize: number;
  meetingRate: number;
  updatedAt: string;
}

// Confidence isn't computed by any real statistical test today (that would
// need retrospective significance testing this codebase doesn't do) -- this
// is a disclosed, simple heuristic instead of a fabricated number: more
// observations narrows the plausible range of the true rate, so confidence
// rises with sample size, capped well short of certainty.
const CONFIDENCE_BASE = 50;
const CONFIDENCE_PER_SAMPLE = 5;
const CONFIDENCE_CAP = 95;

function patternConfidence(sampleSize: number): number {
  return Math.round(Math.min(CONFIDENCE_CAP, CONFIDENCE_BASE + sampleSize * CONFIDENCE_PER_SAMPLE));
}

function toPublicPattern(pattern: InternalPattern): CompanyMemoryResponse["patterns"][number] {
  const meetings = Math.round(pattern.meetingRate * pattern.sampleSize);
  return {
    id: `pattern-${pattern.verdict}`,
    description: pattern.description,
    evidence: `${pattern.sampleSize} decision${pattern.sampleSize === 1 ? "" : "s"}, ${meetings} meeting${meetings === 1 ? "" : "s"}`,
    confidence: patternConfidence(pattern.sampleSize),
    type: "performance_pattern",
    createdAt: pattern.updatedAt,
  };
}

/** Bible §10.5 GET /api/v1/memory. A brand-new team with no outcomes logged
 *  yet has no CompanyMemory row at all (§5.3's "empty on Day 1" cold-start
 *  problem) -- that's a valid, expected state, not a 404: this returns the
 *  same empty shape either way. */
export async function getCompanyMemoryForTeam(teamId: string): Promise<CompanyMemoryResponse> {
  const memory = await getCompanyMemory(teamId);

  const patterns = Array.isArray(memory?.patterns)
    ? (memory.patterns as unknown as InternalPattern[]).map(toPublicPattern)
    : [];

  // riskFlags, icpAccuracy, and topPerformingMessages have no producer
  // anywhere in this codebase yet (see README "Company Memory" section for
  // exactly why each is a separate, larger piece of not-yet-built work) --
  // returned honestly empty/null rather than fabricated.
  return {
    teamId,
    generatedAt: new Date().toISOString(),
    patterns,
    riskFlags: [],
    icpAccuracy: null,
    topPerformingMessages: [],
  };
}
