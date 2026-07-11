import type { OutcomeType } from "@argus/database";
import type { CompanyMemoryResponse } from "@argus/shared";
import { getCompanyMemory, getMessageDraftsForTeam } from "./memory.repository.js";

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

// Bible §10.5's own worked example -- {"pattern": "Mentions specific metric
// from prospect's post", "replyRate": 0.34, "sampleSize": 47} -- treats each
// personalization hook itself as a "pattern" description. The Judge agent
// already generates these as natural-language phrases (§8.7's
// `personalization_hooks`, e.g. "K8s scaling post"), so grouping by the
// exact hook string across every message draft IS this field, not a
// stand-in for real NLP clustering (unlike riskFlags, which genuinely needs
// that -- see README "Company Memory").
//
// "Replied" is deliberately narrower than "has any logged outcome": a
// CLOSED_LOST/DISQUALIFIED/SNOOZED outcome doesn't necessarily mean the
// prospect ever wrote back (a CRM sync can log those with no reply at all),
// so only outcome types that literally denote two-way engagement count.
const REPLIED_OUTCOME_TYPES = new Set<OutcomeType>([
  "REPLIED_NO_MEETING",
  "MEETING_BOOKED",
  "OPPORTUNITY_CREATED",
  "CLOSED_WON",
]);

// A hook used on just one or two messages can look like a 100% or 0% "top
// performer" purely from noise -- this floor keeps the list to hooks with
// enough observations for the rate to mean something, the same reasoning
// patternConfidence above applies to sample size.
const MIN_SAMPLE_SIZE = 3;
const MAX_RESULTS = 10;

interface MessageDraftForCorrelation {
  personalizationHooks: unknown;
  decision: { outcome: { type: OutcomeType } | null };
}

function computeTopPerformingMessages(
  drafts: MessageDraftForCorrelation[],
): CompanyMemoryResponse["topPerformingMessages"] {
  const byHook = new Map<string, { total: number; replied: number }>();

  for (const draft of drafts) {
    if (!draft.decision.outcome) continue; // no ground truth to correlate against yet
    const hooks = Array.isArray(draft.personalizationHooks)
      ? (draft.personalizationHooks as unknown[]).filter((h): h is string => typeof h === "string")
      : [];
    const replied = REPLIED_OUTCOME_TYPES.has(draft.decision.outcome.type);

    for (const hook of hooks) {
      const bucket = byHook.get(hook) ?? { total: 0, replied: 0 };
      bucket.total += 1;
      if (replied) bucket.replied += 1;
      byHook.set(hook, bucket);
    }
  }

  return Array.from(byHook.entries())
    .filter(([, bucket]) => bucket.total >= MIN_SAMPLE_SIZE)
    .map(([pattern, bucket]) => ({
      pattern,
      replyRate: bucket.replied / bucket.total,
      sampleSize: bucket.total,
    }))
    .sort((a, b) => b.replyRate - a.replyRate)
    .slice(0, MAX_RESULTS);
}

/** Bible §10.5 GET /api/v1/memory. A brand-new team with no outcomes logged
 *  yet has no CompanyMemory row at all (§5.3's "empty on Day 1" cold-start
 *  problem) -- that's a valid, expected state, not a 404: this returns the
 *  same empty shape either way. */
export async function getCompanyMemoryForTeam(teamId: string): Promise<CompanyMemoryResponse> {
  const [memory, messageDrafts] = await Promise.all([
    getCompanyMemory(teamId),
    getMessageDraftsForTeam(teamId),
  ]);

  const patterns = Array.isArray(memory?.patterns)
    ? (memory.patterns as unknown as InternalPattern[]).map(toPublicPattern)
    : [];

  // riskFlags and icpAccuracy have no producer anywhere in this codebase
  // yet (see README "Company Memory" section for exactly why each is a
  // separate, larger piece of not-yet-built work) -- returned honestly
  // empty/null rather than fabricated. topPerformingMessages is now real,
  // see computeTopPerformingMessages above.
  return {
    teamId,
    generatedAt: new Date().toISOString(),
    patterns,
    riskFlags: [],
    icpAccuracy: null,
    topPerformingMessages: computeTopPerformingMessages(messageDrafts),
  };
}
