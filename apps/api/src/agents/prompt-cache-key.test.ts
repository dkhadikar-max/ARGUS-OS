import { describe, expect, it } from "vitest";
import { buildSystemPromptCacheKey, buildKnowledgeContextCacheKey, hashCompanyContext, hashPromptTemplate } from "./prompt-cache-key.js";
import { buildDecisionContext, hashKnowledgeFields, type DecisionSources } from "./decision-context-builder.js";

describe("hashPromptTemplate", () => {
  it("is deterministic for the same template", () => {
    expect(hashPromptTemplate("Analyze {{prospect_data}}.")).toBe(hashPromptTemplate("Analyze {{prospect_data}}."));
  });

  it("changes on any wording edit, including whitespace-only changes", () => {
    const original = hashPromptTemplate("Analyze {{prospect_data}}.");
    const edited = hashPromptTemplate("Analyze  {{prospect_data}}.");
    expect(original).not.toBe(edited);
  });
});

describe("hashCompanyContext", () => {
  it("is deterministic for null (and doesn't crash on it)", () => {
    expect(hashCompanyContext(null)).toBe(hashCompanyContext(null));
  });

  it("does not collide a real company context with null", () => {
    expect(hashCompanyContext(null)).not.toBe(hashCompanyContext("We sell CRM software."));
  });

  it("changes when the companyContext string changes", () => {
    expect(hashCompanyContext("We sell CRM software.")).not.toBe(hashCompanyContext("We sell observability tooling."));
  });
});

describe("buildSystemPromptCacheKey", () => {
  const template = "Analyze {{prospect_data}} against {{team_icp}}.";

  it("has the system:{stage}:{promptHash}:{companyContextHash} shape", () => {
    const key = buildSystemPromptCacheKey("research", template, "We sell CRM software.");
    expect(key).toBe(`system:research:${hashPromptTemplate(template)}:${hashCompanyContext("We sell CRM software.")}`);
  });

  it("changes when stageName changes, all else equal", () => {
    const researchKey = buildSystemPromptCacheKey("research", template, "ctx");
    const icpKey = buildSystemPromptCacheKey("icp", template, "ctx");
    expect(researchKey).not.toBe(icpKey);
  });

  it("changes when the prompt template's wording changes, all else equal", () => {
    const before = buildSystemPromptCacheKey("research", template, "ctx");
    const after = buildSystemPromptCacheKey("research", template + " Extra sentence.", "ctx");
    expect(before).not.toBe(after);
  });

  it("changes when companyContext changes, all else equal -- the actual determinant of system prompt content", () => {
    const a = buildSystemPromptCacheKey("research", template, "We sell CRM software.");
    const b = buildSystemPromptCacheKey("research", template, "We sell observability tooling.");
    expect(a).not.toBe(b);
  });
});

describe("buildKnowledgeContextCacheKey", () => {
  it("composes with hashKnowledgeFields from decision-context-builder without either owning the other's hashing", () => {
    const template = "Analyze {{prospect_data}} against {{team_icp}}.";
    const sources: DecisionSources = {
      prospect: { id: "p1", name: "Jane", rawProfile: {}, enrichedData: {} } as unknown as DecisionSources["prospect"],
      icp: { criteria: { minSize: 50 } } as unknown as DecisionSources["icp"],
      companyMemory: null,
      userPreferences: null,
      prospectHistory: [] as unknown as DecisionSources["prospectHistory"],
      teamHistory: [] as unknown as DecisionSources["teamHistory"],
      team: null,
    };
    const knowledge = hashKnowledgeFields(buildDecisionContext(sources));
    const key = buildKnowledgeContextCacheKey("icp", template, knowledge);
    expect(key).toBe(`knowledge-context:icp:${hashPromptTemplate(template)}:${knowledge}`);
  });
});
