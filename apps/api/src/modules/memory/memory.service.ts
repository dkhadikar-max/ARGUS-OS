import type { OutcomeType, Verdict } from "@argus/database";
import { agentDebateOutputSchema, type CompanyMemoryResponse } from "@argus/shared";
import { getCompanyMemory, getDecisionsForRiskFlags, getMessageDraftsForTeam } from "./memory.repository.js";
import { slugify } from "../../lib/slugify.js";
import { computeVersionAccuracy } from "../icp/icp.service.js";
import { getDecisionsSince, getIcp } from "../icp/icp.repository.js";

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
// stand-in for real NLP clustering.
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

    // A hook repeated twice within the same draft's own array still only
    // counts as one occurrence for that draft -- same reasoning
    // computeRiskFlags below applies per-decision for risk categories.
    const uniqueHooks = new Set(hooks);
    for (const hook of uniqueHooks) {
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

type RiskSeverity = "dealbreaker" | "moderate" | "minor";

// Bible §10.5's own worked example ("Director title + >1000 employees")
// implies clustering free-text risk descriptions into named recurring
// conditions -- real text-clustering/NLP work this codebase has no
// infrastructure for (no embeddings, no Pinecone -- see README "Known
// gaps"). This is a disclosed, narrower heuristic instead of that, and
// deliberately won't reproduce the Bible's own illustrative example
// verbatim: the Risk Agent's own prompt (agents/prompts.ts) already
// suggests 6 recurring themes ("Common risk categories: Authority, Budget,
// Timing, Competition, Fit, Engagement") for the freeform `category` field
// it asks Claude to fill in per risk. Keyword-matching each decision's own
// `category` text against those same 6 themes -- the taxonomy the system
// itself already uses, not one invented for this -- groups real recurring
// conditions across decisions without inventing prospect-attribute
// bucketing rules (e.g. what counts as ">1000 employees") the Bible never
// specifies a threshold for.
const RISK_CATEGORY_THEMES: Array<{ theme: string; keywords: string[] }> = [
  { theme: "Authority", keywords: ["authority", "decision maker", "decision-maker"] },
  { theme: "Budget", keywords: ["budget"] },
  { theme: "Timing", keywords: ["timing", "urgency", "exploratory"] },
  { theme: "Competition", keywords: ["competitor", "competition", "competitive"] },
  { theme: "Fit", keywords: ["fit"] },
  { theme: "Engagement", keywords: ["engagement", "respond", "outreach"] },
];

function normalizeRiskCategory(rawCategory: string): string {
  const lower = rawCategory.toLowerCase();
  for (const { theme, keywords } of RISK_CATEGORY_THEMES) {
    if (keywords.some((keyword) => lower.includes(keyword))) return theme;
  }
  return rawCategory.trim();
}

const SEVERITY_RANK: Record<RiskSeverity, number> = { minor: 0, moderate: 1, dealbreaker: 2 };

// Same reasoning as MIN_SAMPLE_SIZE above -- a condition seen in one or two
// decisions isn't a recurring "flag" yet, it's noise.
const MIN_RISK_SAMPLE_SIZE = 3;
const MAX_RISK_RESULTS = 10;

interface DecisionForRiskFlags {
  agentOutputs: unknown;
  outcome: { type: OutcomeType } | null;
}

interface RiskCategoryBucket {
  decisionsWithCategory: number;
  outcomeLoggedCount: number;
  positiveDespiteFlag: number;
  maxSeverity: RiskSeverity;
  recommendation: string;
}

function computeRiskFlags(decisions: DecisionForRiskFlags[]): CompanyMemoryResponse["riskFlags"] {
  let totalAssessed = 0;
  const byCategory = new Map<string, RiskCategoryBucket>();

  for (const decision of decisions) {
    const parsed = agentDebateOutputSchema.safeParse(decision.agentOutputs);
    if (!parsed.success) continue; // no risk assessment to read (predates this field, or malformed)
    totalAssessed += 1;

    // A category seen twice in the same decision's risk list still only
    // counts as one occurrence for that decision -- occurrenceRate below is
    // "fraction of decisions with this condition," not "fraction of risk
    // items."
    const seenInThisDecision = new Set<string>();
    for (const risk of parsed.data.risk.risks) {
      const category = normalizeRiskCategory(risk.category);
      if (seenInThisDecision.has(category)) continue;
      seenInThisDecision.add(category);

      const bucket = byCategory.get(category) ?? {
        decisionsWithCategory: 0,
        outcomeLoggedCount: 0,
        positiveDespiteFlag: 0,
        maxSeverity: risk.severity,
        recommendation: risk.mitigation,
      };
      bucket.decisionsWithCategory += 1;
      // recommendation tracks whichever occurrence set maxSeverity, so the
      // two never drift apart (a "dealbreaker" row always shows the
      // mitigation text that actually came with a dealbreaker instance).
      if (SEVERITY_RANK[risk.severity] > SEVERITY_RANK[bucket.maxSeverity]) {
        bucket.maxSeverity = risk.severity;
        bucket.recommendation = risk.mitigation;
      }
      if (decision.outcome) {
        bucket.outcomeLoggedCount += 1;
        if (REPLIED_OUTCOME_TYPES.has(decision.outcome.type)) {
          // The risk was flagged, but the prospect replied anyway -- the
          // flag would have been a false alarm for this specific decision.
          bucket.positiveDespiteFlag += 1;
        }
      }
      byCategory.set(category, bucket);
    }
  }

  if (totalAssessed === 0) return [];

  return Array.from(byCategory.entries())
    .filter(([, bucket]) => bucket.decisionsWithCategory >= MIN_RISK_SAMPLE_SIZE)
    .map(([category, bucket]) => ({
      id: `risk-${slugify(category)}`,
      condition: category,
      severity: bucket.maxSeverity,
      recommendation: bucket.recommendation,
      occurrenceRate: bucket.decisionsWithCategory / totalAssessed,
      // 0 (not null -- the schema requires a number) when no instance of
      // this category has a logged outcome yet. Distinct from a real 0%
      // false-positive rate, but the same MIN_RISK_SAMPLE_SIZE filter above
      // makes an all-unlogged category increasingly unlikely as data grows.
      falsePositiveRate: bucket.outcomeLoggedCount > 0 ? bucket.positiveDespiteFlag / bucket.outcomeLoggedCount : 0,
    }))
    .sort((a, b) => b.occurrenceRate - a.occurrenceRate)
    .slice(0, MAX_RISK_RESULTS);
}

interface IcpHistoryEntry {
  version?: number;
  accuracy?: number | null;
}

// Bible §10.5 `icpAccuracy` -- `current` is the *active* ICP version's own
// accuracy, computed live from decisions since it activated (icp.service.ts
// only snapshots a version's *final* accuracy into icpHistory once it's
// retired, so the active one has to be scored fresh on every read). `trend`
// compares that against the last *closed* version's own final accuracy --
// an honest "not enough history yet" (not a fabricated delta) until at
// least one ICP edit has happened since this feature shipped, since
// icpHistory starts empty for every team regardless of how long they've
// had an ICP defined.
function computeIcpAccuracy(
  icp: { updatedAt: Date } | null,
  decisionsSinceActivation: Array<{ verdict: Verdict; outcome: { type: OutcomeType } | null }>,
  icpHistory: unknown,
): CompanyMemoryResponse["icpAccuracy"] {
  if (!icp) return null;

  const current = computeVersionAccuracy(decisionsSinceActivation);
  if (current === null) return null; // active version hasn't earned a scoreable outcome yet

  const history = Array.isArray(icpHistory) ? (icpHistory as IcpHistoryEntry[]) : [];
  const lastClosedVersion = history[history.length - 1];
  const trend =
    lastClosedVersion && typeof lastClosedVersion.accuracy === "number"
      ? `${current - lastClosedVersion.accuracy >= 0 ? "+" : ""}${(current - lastClosedVersion.accuracy).toFixed(2)}`
      : "not enough history yet";

  return { current, trend, lastUpdated: new Date().toISOString() };
}

/** Bible §10.5 GET /api/v1/memory. A brand-new team with no outcomes logged
 *  yet has no CompanyMemory row at all (§5.3's "empty on Day 1" cold-start
 *  problem) -- that's a valid, expected state, not a 404: this returns the
 *  same empty shape either way. */
export async function getCompanyMemoryForTeam(teamId: string): Promise<CompanyMemoryResponse> {
  const [memory, messageDrafts, riskDecisions, icp] = await Promise.all([
    getCompanyMemory(teamId),
    getMessageDraftsForTeam(teamId),
    getDecisionsForRiskFlags(teamId),
    getIcp(teamId),
  ]);

  const decisionsSinceIcpActivation = icp ? await getDecisionsSince(teamId, icp.updatedAt) : [];

  const patterns = Array.isArray(memory?.patterns)
    ? (memory.patterns as unknown as InternalPattern[]).map(toPublicPattern)
    : [];

  // patterns, topPerformingMessages, riskFlags, and icpAccuracy are all
  // real now -- computed server-side, not fabricated.
  return {
    teamId,
    generatedAt: new Date().toISOString(),
    patterns,
    riskFlags: computeRiskFlags(riskDecisions),
    icpAccuracy: computeIcpAccuracy(icp, decisionsSinceIcpActivation, memory?.icpHistory),
    topPerformingMessages: computeTopPerformingMessages(messageDrafts),
  };
}
