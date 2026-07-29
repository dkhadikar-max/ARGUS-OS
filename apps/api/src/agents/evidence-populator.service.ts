import { prisma, Prisma, type EvidenceEdgeRelation, type EvidenceSource, type EvidenceType } from "@argus/database";
import type { ApolloOrganization, ApolloPerson } from "../lib/enrichment/apollo-client.js";
import type { ClearbitCompany } from "../lib/enrichment/clearbit-client.js";
import { sourceQuality } from "./retrievers/scoring.js";

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
 *
 * Batched by design: a first version issued up to 28 sequential Prisma
 * round-trips per call (one per markStalePrior/evidence.create/edge
 * create). This version computes every row/edge to write as a pure,
 * DB-free step first, then does exactly 3 real statements inside one
 * transaction: one batched `updateMany` for staleness, one
 * `createManyAndReturn` for every Evidence row, one `createMany` for
 * every EvidenceEdge (resolved against the real IDs the previous step
 * returned).
 *
 * Measured against the real local Postgres dev DB (11-row/6-edge fixture,
 * BEGIN/COMMIT included in the count): before -- 28 queries, 344-471ms;
 * after -- 5 queries (3 real statements + BEGIN/COMMIT), 106.8ms cold /
 * 27.5ms on a warm connection. Verified functionally unchanged: same 5
 * checks (row count, edge relations, no duplicate explosion on repeat,
 * clean transaction rollback with no orphaned edges, this latency
 * measurement) all still pass, 680/680 existing tests unaffected.
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

// --- Pure planning step: decide every row/edge to write with zero DB
// access, so the transaction below only ever does 3 round-trips regardless
// of how many dimensions/fields are present. ---

interface PendingRow {
  type: EvidenceType;
  source: EvidenceSource;
  dimension: string;
  value: number | string;
  otherValue: number | string | null;
  agreement: Agreement;
  confidence: number;
}

interface PendingEdge {
  fromDimension: string;
  fromSource: EvidenceSource;
  toDimension: string;
  toSource: EvidenceSource;
  relation: EvidenceEdgeRelation;
  strength: number;
}

function planSharedDimension(dimension: SharedDimension, apolloValue: number | string | null, clearbitValue: number | string | null): { rows: PendingRow[]; edges: PendingEdge[] } {
  if (apolloValue == null && clearbitValue == null) return { rows: [], edges: [] };

  if (apolloValue != null && clearbitValue != null) {
    const { agree, strength } = compareDimension(dimension, apolloValue, clearbitValue);
    const agreement: Agreement = agree ? "corroborated" : "contradicted";
    const confidence = adjustConfidence(baseConfidence("APOLLO"), agreement); // APOLLO/CLEARBIT share the same base (both 0.85), so one computation covers both
    const rows: PendingRow[] = [
      { type: "FIRMOGRAPHIC", source: "APOLLO", dimension, value: apolloValue, otherValue: clearbitValue, agreement, confidence },
      { type: "FIRMOGRAPHIC", source: "CLEARBIT", dimension, value: clearbitValue, otherValue: apolloValue, agreement, confidence },
    ];
    const relation: EvidenceEdgeRelation = agree ? "CORROBORATES" : "CONTRADICTS";
    // Bidirectional: evidence-graph.service.ts's getCorroborations/
    // getContradictions both filter on `toId: evidenceId`, so both nodes
    // need to be independently discoverable as "corroborated/contradicted
    // by" the other.
    const edges: PendingEdge[] = [
      { fromDimension: dimension, fromSource: "APOLLO", toDimension: dimension, toSource: "CLEARBIT", relation, strength },
      { fromDimension: dimension, fromSource: "CLEARBIT", toDimension: dimension, toSource: "APOLLO", relation, strength },
    ];
    return { rows, edges };
  }

  const source: EvidenceSource = apolloValue != null ? "APOLLO" : "CLEARBIT";
  const value = apolloValue != null ? apolloValue : (clearbitValue as number | string);
  return { rows: [{ type: "FIRMOGRAPHIC", source, dimension, value, otherValue: null, agreement: "single-source", confidence: baseConfidence(source) }], edges: [] };
}

function planApolloOnlyField(field: ApolloOnlyField, value: string | null): PendingRow[] {
  if (value == null) return [];
  return [{ type: APOLLO_ONLY_FIELD_TYPE[field], source: "APOLLO", dimension: field, value, otherValue: null, agreement: "single-source", confidence: baseConfidence("APOLLO") }];
}

function planWrites(input: EvidencePopulatorInput): { rows: PendingRow[]; edges: PendingEdge[] } {
  const rows: PendingRow[] = [];
  const edges: PendingEdge[] = [];

  for (const dimension of SHARED_DIMENSIONS) {
    const planned = planSharedDimension(dimension, apolloReadingFor(input.apollo, dimension), clearbitReadingFor(input.clearbit, dimension));
    rows.push(...planned.rows);
    edges.push(...planned.edges);
  }

  if (input.apollo) rows.push(...planApolloOnlyField("latestFundingRoundDate", input.apollo.latestFundingRoundDate));
  if (input.person) {
    rows.push(...planApolloOnlyField("title", input.person.title));
    rows.push(...planApolloOnlyField("seniority", input.person.seniority));
    rows.push(...planApolloOnlyField("email", input.person.email));
    rows.push(...planApolloOnlyField("emailStatus", input.person.emailStatus));
  }

  return { rows, edges };
}

function rowSignal(row: PendingRow): { signal: string; relevance: string } {
  const vendor = row.source === "APOLLO" ? "Apollo.io" : row.source === "CLEARBIT" ? "Clearbit" : row.source;
  return { signal: `${row.dimension}: ${row.value} (${row.source})`, relevance: `Company firmographics from ${vendor} (Evidence Populator)` };
}

/** Mirrors enrichProspect's own skip/failure contract: if apollo, clearbit,
 *  and person are all null, this is a correct no-op (fresh-within-30-days
 *  skip, or every provider failed) -- zero Prisma calls. Same result if
 *  every dimension/field happened to be null despite a non-null input
 *  (e.g. an ApolloOrganization with every field null). */
export async function populateEvidenceFromEnrichment(input: EvidencePopulatorInput): Promise<EvidencePopulatorResult> {
  const { prospectId, apollo, clearbit, person } = input;
  if (!apollo && !clearbit && !person) return EMPTY_RESULT;

  const { rows, edges } = planWrites(input);
  if (rows.length === 0) return EMPTY_RESULT;

  return prisma.$transaction(async (tx: Tx) => {
    // 1 round-trip: mark every superseded (prospectId, dimension, source)
    // row stale in one batched updateMany, instead of one call per row.
    // Scoped narrower than EvidenceType on purpose -- all 3 shared
    // dimensions share FIRMOGRAPHIC, so type-scoping would incorrectly
    // stale companyIndustry just because companySize refreshed. Old
    // buildEnrichmentEvidence rows have no `dimension` key in `data`, so
    // they're structurally excluded from every branch of this OR.
    const { count: staleMarked } = await tx.evidence.updateMany({
      where: {
        prospectId,
        isStale: false,
        OR: rows.map((r) => ({ source: r.source, data: { path: ["dimension"], equals: r.dimension } })),
      },
      data: { isStale: true },
    });

    // 1 round-trip: every Evidence row in one statement. createManyAndReturn
    // (Postgres-backed, available on this Prisma version) gives back real
    // IDs without a second query -- a plain createMany wouldn't.
    const created = await tx.evidence.createManyAndReturn({
      data: rows.map((r) => ({
        type: r.type,
        source: r.source,
        confidence: r.confidence,
        prospectId,
        data: { dimension: r.dimension, value: r.value, agreement: r.agreement, otherSource: r.otherValue != null ? { value: r.otherValue } : null, ...rowSignal(r) },
      })),
    });

    // Correlate returned rows back to pending edges via (source, dimension)
    // -- both are already being persisted, and the combination is unique
    // within this call by construction (each dimension/field is planned
    // at most once per source), so no synthetic key needs to be invented
    // or stored. Safer than relying on createManyAndReturn's row order,
    // which Prisma does not document as guaranteed to match input order.
    const idByKey = new Map(created.map((row) => [`${(row.data as { dimension: string }).dimension}:${row.source}`, row.id]));

    // 1 round-trip: every edge in one statement, only after real Evidence
    // IDs exist. Uses evidenceEdge.createMany directly rather than
    // evidence-graph.service.ts's createEvidenceEdge (idempotent upsert,
    // one call each) -- collision on (fromId, toId, relation) is
    // structurally impossible here since every ID above was just freshly
    // generated in this same transaction, so the upsert's idempotency
    // guarantee buys nothing and would cost N round-trips for nothing.
    let edgesCreated = 0;
    if (edges.length > 0) {
      await tx.evidenceEdge.createMany({
        data: edges.map((e) => ({
          fromId: idByKey.get(`${e.fromDimension}:${e.fromSource}`)!,
          toId: idByKey.get(`${e.toDimension}:${e.toSource}`)!,
          relation: e.relation,
          strength: e.strength,
        })),
      });
      edgesCreated = edges.length;
    }

    return { evidenceCreated: rows.length, edgesCreated, staleMarked };
  });
}
