import { createHash } from "node:crypto";
import type { Prospect } from "@argus/database";
import type { getActiveIcp, getCompanyMemory, getProspectDecisionHistory, getTeamOutcomeHistory, getUserPreferences } from "../modules/decisions/decision.repository.js";
import type { getTeam } from "../modules/teams/team.repository.js";
import type { DecisionAgentInput } from "./orchestrator.js";

// v4 roadmap Phase 16 Day 2 (docs/ARCHITECTURE_V4.md) -- mirrors exactly
// what decision.service.ts's createDecision already fetches via one
// Promise.all before shaping it into a DecisionAgentInput. Typed off the
// real repository functions' own return types rather than a hand-written
// duplicate shape, so this can't silently drift from what Prisma actually
// returns.
export interface DecisionSources {
  prospect: Prospect;
  icp: Awaited<ReturnType<typeof getActiveIcp>>;
  companyMemory: Awaited<ReturnType<typeof getCompanyMemory>>;
  userPreferences: Awaited<ReturnType<typeof getUserPreferences>>;
  prospectHistory: Awaited<ReturnType<typeof getProspectDecisionHistory>>;
  teamHistory: Awaited<ReturnType<typeof getTeamOutcomeHistory>>;
  team: Awaited<ReturnType<typeof getTeam>>;
}

/**
 * Centralizes the DecisionAgentInput shaping logic that decision.service.ts
 * previously inlined directly in its runAgentDebate({...}) call literal.
 * decision.service.ts's own fetch (getActiveIcp/getCompanyMemory/etc., still
 * one Promise.all) is unchanged and remains the authoritative source of
 * decision inputs -- this only owns turning those already-fetched pieces
 * into the shape runAgentDebate expects. Output is byte-for-byte identical
 * to the object decision.service.ts used to build inline.
 */
export function buildDecisionContext(sources: DecisionSources): DecisionAgentInput {
  return {
    prospectData: {
      profile: { name: sources.prospect.name, title: sources.prospect.title, linkedInUrl: sources.prospect.linkedInUrl },
      company: {
        name: sources.prospect.companyName,
        domain: sources.prospect.companyDomain,
        size: sources.prospect.companySize,
        industry: sources.prospect.companyIndustry,
        funding: sources.prospect.companyFunding,
      },
      rawProfile: sources.prospect.rawProfile,
      enrichedData: sources.prospect.enrichedData,
    },
    teamIcp: sources.icp?.criteria ?? null,
    companyMemory: sources.companyMemory
      ? { patterns: sources.companyMemory.patterns, riskFlags: sources.companyMemory.riskFlags }
      : null,
    intentSignals: sources.prospect.rawProfile,
    historicalEngagement: sources.prospectHistory.map((d) => ({
      verdict: d.verdict,
      outcome: d.outcome?.type ?? null,
      createdAt: d.createdAt,
    })),
    teamHistory: sources.teamHistory.map((d) => ({ verdict: d.verdict, outcome: d.outcome?.type })),
    userPreferences: sources.userPreferences ?? null,
    teamPatterns: sources.companyMemory?.patterns ?? null,
    companyContext: sources.team?.companyContext ?? null,
  };
}

// Recursively sorts object keys so JSON.stringify produces the same string
// regardless of property insertion order -- refinement #2 (raw
// JSON.stringify on a DB-assembled object has no guaranteed key order, so
// identical content could otherwise hash differently). Dates are special-
// cased: Object.keys() on a Date returns [] (its value isn't stored as own
// enumerable properties), so without this case a Date would silently
// canonicalize to {} instead of its actual value.
function sortKeysDeep(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

// Only the fields that are genuinely team-level knowledge, shared across
// many decisions for the same team -- teamIcp/companyMemory/teamHistory/
// userPreferences/teamPatterns. prospectData, intentSignals (prospect's own
// rawProfile), and historicalEngagement (this specific prospect's decision
// history) are per-prospect, not team knowledge, and are deliberately
// excluded here regardless of how low their duplication happened to look
// across the 51 eval fixtures (Phase 15) -- that low cardinality is a
// fixture-generation artifact, not evidence they're team-shared in
// production.
export function hashKnowledgeFields(input: DecisionAgentInput): string {
  const canonical = canonicalize({
    teamIcp: input.teamIcp,
    companyMemory: input.companyMemory,
    teamHistory: input.teamHistory,
    userPreferences: input.userPreferences,
    teamPatterns: input.teamPatterns,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
