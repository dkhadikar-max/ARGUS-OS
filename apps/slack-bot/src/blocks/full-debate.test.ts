import { describe, expect, it } from "vitest";
import type { DecisionResponse } from "@argus/shared";
import { buildFullDebateBlocks } from "./full-debate.js";

const debate: NonNullable<DecisionResponse["debate"]> = {
  research: {
    summary: "Solid fit.",
    data_points: [{ type: "firmographic", signal: "Series B", relevance: "Ideal stage" }],
    unfair_advantages: [],
    hidden_risks: [],
    confidence: 88,
    data_gaps: [],
  },
  icp: {
    score: 90,
    criteria_evaluated: [
      { criterion: "Company stage", weight: 0.4, match: 1, evidence: "Series B", reasoning: "Ideal stage" },
    ],
    overall_assessment: "Great fit.",
    edge_cases: [],
    confidence: 90,
  },
  intent: {
    score: 80,
    signals: [{ signal: "Hiring SREs", raw_score: 3, weighted_score: 3, recency_days: 5, reasoning: "Scaling pain" }],
    trajectory: "increasing",
    false_intent_flags: [],
    confidence: 85,
  },
  risk: {
    score: 10,
    risks: [{ category: "Cold outreach", severity: "minor", description: "No prior contact", evidence: "None", mitigation: "Warm intro" }],
    red_flags: [],
    time_waste_probability: 10,
    mitigation_strategies: [],
    confidence: 85,
  },
  judge: {
    verdict: "STRONG_YES",
    confidence: 94,
    weighted_score: 94.2,
    agent_consensus: "high",
    conflicts: [],
    reasoning: "Strong across the board.",
    key_evidence: ["Series B"],
    message: { linkedin: "Hi Sarah", email: null, tone: "professional", personalization_hooks: [] },
    recommended_action: "message_now",
    confidence_explanation: "High quality data.",
  },
};

function decision(overrides: Partial<DecisionResponse> = {}): DecisionResponse {
  return {
    id: "dec_1",
    status: "completed",
    prospect: { name: "Sarah Chen", title: "VP Engineering", companyName: "DataFlow Inc.", linkedInUrl: "https://linkedin.com/in/sarahchen" },
    verdict: "STRONG_YES",
    confidence: 94,
    reasoning: "Series B fintech with strong ICP fit.",
    evidence: [
      { id: "ev_1", type: "FIRMOGRAPHIC", signal: "Series B, $24M raised", relevance: "Ideal stage", confidence: 90 },
    ],
    message: { linkedin: "Hi Sarah — saw your post", email: null, tone: "professional", personalizationHooks: [] },
    recommendedAction: "message_now",
    processingTimeMs: 3200,
    createdAt: "2026-07-10T14:32:00Z",
    debate,
    ...overrides,
  };
}

describe("buildFullDebateBlocks", () => {
  it("renders all 5 agent sections (Bible §6.5)", () => {
    const blocks = buildFullDebateBlocks(decision());
    const text = JSON.stringify(blocks);
    expect(text).toContain("RESEARCH AGENT");
    expect(text).toContain("ICP AGENT");
    expect(text).toContain("INTENT AGENT");
    expect(text).toContain("RISK AGENT");
    expect(text).toContain("JUDGE AGENT");
  });

  it("includes the weighted aggregation formula and final weighted score", () => {
    const blocks = buildFullDebateBlocks(decision());
    const text = JSON.stringify(blocks);
    expect(text).toContain("ICP (40%) + Intent (35%) + Risk (15%) + Research (10%)");
    expect(text).toContain("94.2%");
  });

  it("falls back to the flattened evidence list when debate is null (pre-existing decision row)", () => {
    const blocks = buildFullDebateBlocks(decision({ debate: null }));
    const text = JSON.stringify(blocks);
    expect(text).toContain("Full evidence");
    expect(text).toContain("Series B, $24M raised");
    expect(text).not.toContain("ICP AGENT");
  });

  it("includes prospect name and company in the header", () => {
    const blocks = buildFullDebateBlocks(decision());
    const text = JSON.stringify(blocks);
    expect(text).toContain("Sarah Chen, VP Engineering @ DataFlow Inc.");
  });
});
