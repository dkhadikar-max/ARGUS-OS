import { prisma, Prisma, type EvidenceSource, type EvidenceType } from "@argus/database";
import type { ApolloOrganization, ApolloPerson } from "../lib/enrichment/apollo-client.js";
import type { ClearbitCompany } from "../lib/enrichment/clearbit-client.js";
import { sourceQuality } from "./retrievers/scoring.js";
import { createEvidenceEdge } from "./evidence-graph.service.js";

/**
 * Evidence Graph Phase 1 ("Safe") -- populates the existing Evidence/
 * EvidenceEdge tables from Apollo/Clearbit enrichment output with real
 * per-source confidence and corroboration/contradiction detection,
 * instead of enrichment.service.ts's flat `apollo ?? clearbit` precedence.
 * Every row written here has `decisionId: null` -- entirely separate from
 * decision.service.ts's buildEnrichmentEvidence, which already writes
 * flat-confidence-90 Evidence rows attached to a Decision on every
 * request (decision.service.ts:63-127) and is part of the live
 * DecisionResponse. This populator never touches that path; it exists
 * purely to make the shadow-only retriever/EvidenceEdge machinery
 * (capability-shadow.ts, evidence-graph.service.ts) meaningful, gated
 * behind env.EVIDENCE_POPULATOR_V1 (default false).
 */

type Tx = Prisma.TransactionClient;

export interface EvidencePopulatorInput {
  prospectId: string;
  apollo: ApolloOrganization | null;
  clearbit: ClearbitCompany | null;
  person: ApolloPerson | null;
}

export interface EvidencePopulatorResult {
  evidenceCreated: number;
  edgesCreated: number;
  staleMarked: number;
}

const EMPTY_RESULT: EvidencePopulatorResult = { evidenceCreated: 0, edgesCreated: 0, staleMarked: 0 };

function mergeResults(a: EvidencePopulatorResult, b: EvidencePopulatorResult): EvidencePopulatorResult {
  return {
    evidenceCreated: a.evidenceCreated + b.evidenceCreated,
    edgesCreated: a.edgesCreated + b.edgesCreated,
    staleMarked: a.staleMarked + b.staleMarked,
  };
}

// The 3 firmographic dimensions both Apollo and Clearbit report --
// everything else either has only one possible source (Apollo-only person
// fields) or isn't attempted here (unstructured LinkedIn text extraction
// is the deferred Qwen/crawler phase, not this one).
type SharedDimension = "companySize" | "companyIndustry" | "companyFunding";
const SHARED_DIMENSIONS: readonly SharedDimension[] = ["companySize", "companyIndustry", "companyFunding"];
const NUMERIC_DIMENSIONS: ReadonlySet<SharedDimension> = new Set(["companySize", "companyFunding"]);

type ApolloOnlyField = "title" | "seniority" | "email" | "emailStatus" | "latestFundingRoundDate";
// Matches decision.service.ts's own buildEnrichmentEvidence classification
// of person-level vs. company-level fields.
const APOLLO_ONLY_FIELD_TYPE: Record<ApolloOnlyField, EvidenceType> = {
  title: "DEMOGRAPHIC",
  seniority: "DEMOGRAPHIC",
  email: "DEMOGRAPHIC",
  emailStatus: "DEMOGRAPHIC",
  latestFundingRoundDate: "FIRMOGRAPHIC",
};

type Agreement = "corroborated" | "contradicted" | "single-source";

// Confidence is a disclosed heuristic (small named constants), not a
// statistical model -- same spirit as memory.service.ts's
// patternConfidence. Base comes from retrievers/scoring.ts's existing
// SOURCE_QUALITY map (APOLLO/CLEARBIT both 0.85 -> base 85).
const CORROBORATION_BOOST = 15;
const CONTRADICTION_PENALTY = 20; // larger than the boost on purpose -- an unnoticed contradiction is worse than an unclaimed corroboration
const CONFIDENCE_FLOOR = 10;
const CONFIDENCE_CEILING = 99; // never claim absolute certainty from third-party vendor data

// Relative-difference tolerance for numeric dimensions: two independent
// vendor estimates rarely match exactly even when both are "right"
// (different scrape dates, rounding, headcount definitions).
const NUMERIC_TOLERANCE_RATIO = 0.15;

// Categorical (industry) agreement has no natural "how wrong" scale, so a
// contradiction gets the schema's own default strength rather than an
// invented magnitude.
const INDUSTRY_CORROBORATION_STRENGTH = 1.0;
const INDUSTRY_CONTRADICTION_STRENGTH = 0.5;

function baseConfidence(source: EvidenceSource): number {
  return Math.round(sourceQuality(source) * 100);
}

function adjustConfidence(base: number, agreement: Agreement): number {
  const delta = agreement === "corroborated" ? CORROBORATION_BOOST : agreement === "contradicted" ? -CONTRADICTION_PENALTY : 0;
  return Math.max(CONFIDENCE_FLOOR, Math.min(CONFIDENCE_CEILING, base + delta));
}

function normalizeIndustry(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function compareDimension(dimension: SharedDimension, apolloValue: number | string, clearbitValue: number | string): { agree: boolean; strength: number } {
  if (NUMERIC_DIMENSIONS.has(dimension)) {
    const a = apolloValue as number;
    const b = clearbitValue as number;
    const denom = Math.max(Math.abs(a), Math.abs(b), 1);
    const relDiff = Math.abs(a - b) / denom;
    const agree = relDiff <= NUMERIC_TOLERANCE_RATIO;
    return { agree, strength: agree ? Math.max(0, 1 - relDiff) : Math.min(1, relDiff) };
  }
  const agree = normalizeIndustry(apolloValue as string) === normalizeIndustry(clearbitValue as string);
  return { agree, strength: agree ? INDUSTRY_CORROBORATION_STRENGTH : INDUSTRY_CONTRADICTION_STRENGTH };
}

// apollo.totalFunding / clearbit.raised are raw numbers -- deliberately
// NOT Prospect.companyFunding, which enrichment.service.ts formats as a
// locale string ("$1,000,000") that would break numeric comparison.
function apolloReadingFor(apollo: ApolloOrganization | null, dimension: SharedDimension): number | string | null {
  if (!apollo) return null;
  if (dimension === "companySize") return apollo.estimatedNumEmployees;
  if (dimension === "companyIndustry") return apollo.industry;
  return apollo.totalFunding;
}

function clearbitReadingFor(clearbit: ClearbitCompany | null, dimension: SharedDimension): number | string | null {
  if (!clearbit) return null;
  if (dimension === "companySize") return clearbit.employees;
  if (dimension === "companyIndustry") return clearbit.industry;
  return clearbit.raised;
}

/** Marks prior non-stale rows for this exact (prospectId, dimension,
 *  source) as stale -- scoped narrower than EvidenceType, since all 3
 *  shared dimensions are FIRMOGRAPHIC and type-scoping would incorrectly
 *  stale companyIndustry just because companySize refreshed. Pre-existing
 *  buildEnrichmentEvidence rows have no `dimension` key in `data`, so
 *  they're structurally excluded from this filter. Called before the new
 *  row is inserted, so the fresh row is never marked stale by its own
 *  write. */
async function markStalePrior(tx: Tx, prospectId: string, dimension: string, source: EvidenceSource): Promise<number> {
  const { count } = await tx.evidence.updateMany({
    where: { prospectId, source, isStale: false, data: { path: ["dimension"], equals: dimension } },
    data: { isStale: true },
  });
  return count;
}

async function createDimensionEvidence(
  tx: Tx,
  prospectId: string,
  type: EvidenceType,
  dimension: string,
  source: EvidenceSource,
  value: number | string,
  otherValue: number | string | null,
  agreement: Agreement,
) {
  const confidence = adjustConfidence(baseConfidence(source), agreement);
  return tx.evidence.create({
    data: {
      type,
      source,
      confidence,
      prospectId,
      data: {
        dimension,
        value,
        agreement,
        otherSource: otherValue != null ? { value: otherValue } : null,
        signal: `${dimension}: ${value} (${source})`,
        relevance: `Company firmographics from ${source === "APOLLO" ? "Apollo.io" : source === "CLEARBIT" ? "Clearbit" : source} (Evidence Populator)`,
      },
    },
  });
}

async function processSharedDimension(
  tx: Tx,
  prospectId: string,
  dimension: SharedDimension,
  apolloValue: number | string | null,
  clearbitValue: number | string | null,
): Promise<EvidencePopulatorResult> {
  if (apolloValue == null && clearbitValue == null) return EMPTY_RESULT;

  let staleMarked = 0;
  if (apolloValue != null) staleMarked += await markStalePrior(tx, prospectId, dimension, "APOLLO");
  if (clearbitValue != null) staleMarked += await markStalePrior(tx, prospectId, dimension, "CLEARBIT");

  if (apolloValue != null && clearbitValue != null) {
    const { agree, strength } = compareDimension(dimension, apolloValue, clearbitValue);
    const agreement: Agreement = agree ? "corroborated" : "contradicted";
    const apolloEv = await createDimensionEvidence(tx, prospectId, "FIRMOGRAPHIC", dimension, "APOLLO", apolloValue, clearbitValue, agreement);
    const clearbitEv = await createDimensionEvidence(tx, prospectId, "FIRMOGRAPHIC", dimension, "CLEARBIT", clearbitValue, apolloValue, agreement);
    const relation = agree ? "CORROBORATES" : "CONTRADICTS";
    // Bidirectional: evidence-graph.service.ts's getCorroborations/
    // getContradictions both filter on `toId: evidenceId`, so both nodes
    // need to be independently discoverable as "corroborated/contradicted
    // by" the other.
    await createEvidenceEdge({ fromId: apolloEv.id, toId: clearbitEv.id, relation, strength }, tx);
    await createEvidenceEdge({ fromId: clearbitEv.id, toId: apolloEv.id, relation, strength }, tx);
    return { evidenceCreated: 2, edgesCreated: 2, staleMarked };
  }

  const source: EvidenceSource = apolloValue != null ? "APOLLO" : "CLEARBIT";
  const value = apolloValue != null ? apolloValue : (clearbitValue as number | string);
  await createDimensionEvidence(tx, prospectId, "FIRMOGRAPHIC", dimension, source, value, null, "single-source");
  return { evidenceCreated: 1, edgesCreated: 0, staleMarked };
}

async function processApolloOnlyField(tx: Tx, prospectId: string, field: ApolloOnlyField, value: string | null): Promise<EvidencePopulatorResult> {
  if (value == null) return EMPTY_RESULT;
  const staleMarked = await markStalePrior(tx, prospectId, field, "APOLLO");
  await createDimensionEvidence(tx, prospectId, APOLLO_ONLY_FIELD_TYPE[field], field, "APOLLO", value, null, "single-source");
  return { evidenceCreated: 1, edgesCreated: 0, staleMarked };
}

/** Mirrors enrichProspect's own skip/failure contract: if apollo, clearbit,
 *  and person are all null, this is a correct no-op (fresh-within-30-days
 *  skip, or every provider failed) -- zero Prisma calls. */
export async function populateEvidenceFromEnrichment(input: EvidencePopulatorInput): Promise<EvidencePopulatorResult> {
  const { prospectId, apollo, clearbit, person } = input;
  if (!apollo && !clearbit && !person) return EMPTY_RESULT;

  return prisma.$transaction(async (tx) => {
    let result = EMPTY_RESULT;

    for (const dimension of SHARED_DIMENSIONS) {
      const apolloValue = apolloReadingFor(apollo, dimension);
      const clearbitValue = clearbitReadingFor(clearbit, dimension);
      result = mergeResults(result, await processSharedDimension(tx, prospectId, dimension, apolloValue, clearbitValue));
    }

    if (apollo) {
      result = mergeResults(result, await processApolloOnlyField(tx, prospectId, "latestFundingRoundDate", apollo.latestFundingRoundDate));
    }
    if (person) {
      result = mergeResults(result, await processApolloOnlyField(tx, prospectId, "title", person.title));
      result = mergeResults(result, await processApolloOnlyField(tx, prospectId, "seniority", person.seniority));
      result = mergeResults(result, await processApolloOnlyField(tx, prospectId, "email", person.email));
      result = mergeResults(result, await processApolloOnlyField(tx, prospectId, "emailStatus", person.emailStatus));
    }

    return result;
  });
}
