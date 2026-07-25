import { describe, expect, it } from "vitest";
import { buildDecisionContext, hashKnowledgeFields, type DecisionSources } from "./decision-context-builder.js";

function sources(overrides: Partial<DecisionSources> = {}): DecisionSources {
  return {
    prospect: {
      id: "prospect_1",
      name: "Jane Prospect",
      title: "VP Eng",
      linkedInUrl: "https://linkedin.com/in/jane",
      companyName: "Acme Corp",
      companyDomain: "acme.com",
      companySize: "51-200",
      companyIndustry: "SaaS",
      companyFunding: "Series B",
      rawProfile: { headline: "Building things" },
      enrichedData: { source: "apollo" },
    } as unknown as DecisionSources["prospect"],
    icp: { criteria: { minSize: 50 } } as unknown as DecisionSources["icp"],
    companyMemory: { patterns: ["fast-close"], riskFlags: ["budget-freeze"] } as unknown as DecisionSources["companyMemory"],
    userPreferences: { tone: "casual", updatedAt: new Date("2026-01-01T00:00:00Z") } as unknown as DecisionSources["userPreferences"],
    prospectHistory: [
      { verdict: "YES", outcome: { type: "WON" }, createdAt: new Date("2026-02-01T00:00:00Z") },
    ] as unknown as DecisionSources["prospectHistory"],
    teamHistory: [{ verdict: "PASS", outcome: { type: "LOST" } }] as unknown as DecisionSources["teamHistory"],
    team: { companyContext: "We sell observability tooling." } as unknown as DecisionSources["team"],
    ...overrides,
  };
}

describe("buildDecisionContext", () => {
  it("reconstructs the exact DecisionAgentInput shape decision.service.ts used to build inline", () => {
    const input = buildDecisionContext(sources());
    expect(input).toEqual({
      prospectData: {
        profile: { name: "Jane Prospect", title: "VP Eng", linkedInUrl: "https://linkedin.com/in/jane" },
        company: { name: "Acme Corp", domain: "acme.com", size: "51-200", industry: "SaaS", funding: "Series B" },
        rawProfile: { headline: "Building things" },
        enrichedData: { source: "apollo" },
      },
      teamIcp: { minSize: 50 },
      companyMemory: { patterns: ["fast-close"], riskFlags: ["budget-freeze"] },
      intentSignals: { headline: "Building things" },
      historicalEngagement: [{ verdict: "YES", outcome: "WON", createdAt: new Date("2026-02-01T00:00:00Z") }],
      teamHistory: [{ verdict: "PASS", outcome: "LOST" }],
      userPreferences: { tone: "casual", updatedAt: new Date("2026-01-01T00:00:00Z") },
      teamPatterns: ["fast-close"],
      companyContext: "We sell observability tooling.",
    });
  });

  it("nulls out teamIcp/companyMemory/teamPatterns/companyContext when those sources are absent", () => {
    const input = buildDecisionContext(
      sources({ icp: null, companyMemory: null, team: null } as Partial<DecisionSources>),
    );
    expect(input.teamIcp).toBeNull();
    expect(input.companyMemory).toBeNull();
    expect(input.teamPatterns).toBeNull();
    expect(input.companyContext).toBeNull();
  });
});

describe("hashKnowledgeFields", () => {
  it("is stable regardless of nested key insertion order (canonical serialization)", () => {
    const a = buildDecisionContext(sources());
    const reordered = buildDecisionContext(
      sources({
        companyMemory: { riskFlags: ["budget-freeze"], patterns: ["fast-close"] } as unknown as DecisionSources["companyMemory"],
      }),
    );
    expect(hashKnowledgeFields(a)).toBe(hashKnowledgeFields(reordered));
  });

  it("changes when a knowledge field (teamIcp) changes", () => {
    const a = buildDecisionContext(sources());
    const b = buildDecisionContext(sources({ icp: { criteria: { minSize: 999 } } as unknown as DecisionSources["icp"] }));
    expect(hashKnowledgeFields(a)).not.toBe(hashKnowledgeFields(b));
  });

  it("does NOT change when only per-prospect fields (prospectData/historicalEngagement) change", () => {
    const a = buildDecisionContext(sources());
    const b = buildDecisionContext(
      sources({
        prospect: { ...sources().prospect, name: "A Totally Different Prospect" } as DecisionSources["prospect"],
        prospectHistory: [] as unknown as DecisionSources["prospectHistory"],
      }),
    );
    expect(hashKnowledgeFields(a)).toBe(hashKnowledgeFields(b));
  });

  it("preserves Date values inside knowledge fields rather than collapsing them to {}", () => {
    const a = buildDecisionContext(sources());
    const differentUpdatedAt = buildDecisionContext(
      sources({
        userPreferences: { tone: "casual", updatedAt: new Date("2030-01-01T00:00:00Z") } as unknown as DecisionSources["userPreferences"],
      }),
    );
    expect(hashKnowledgeFields(a)).not.toBe(hashKnowledgeFields(differentUpdatedAt));
  });

  it("is deterministic for the same input", () => {
    const input = buildDecisionContext(sources());
    expect(hashKnowledgeFields(input)).toBe(hashKnowledgeFields(input));
  });
});
