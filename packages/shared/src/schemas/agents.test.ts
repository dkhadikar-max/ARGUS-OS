import { describe, expect, it } from "vitest";
import { agentDebateOutputSchema } from "./agents.js";

// Bible §8.2 combined output shape — mirrors the DataFlow/Sarah Chen
// example used throughout §6.1 and §10.2 so the schema is validated
// against the Bible's own worked example, not an invented one.
function validDebateOutput() {
  return {
    research: {
      summary: "Series B fintech with active infra scaling pain.",
      data_points: [
        {
          type: "firmographic",
          signal: "Series B, $24M raised, 87 employees",
          relevance: "Ideal company stage and size",
        },
      ],
      unfair_advantages: ["Hiring 3 SREs"],
      hidden_risks: ["No previous engagement"],
      confidence: 90,
      data_gaps: [],
    },
    icp: {
      score: 95,
      criteria_evaluated: [
        {
          criterion: "Series B stage",
          weight: 0.3,
          match: 1,
          evidence: "Raised Series B 14 months ago",
          reasoning: "Exact stage match",
        },
      ],
      overall_assessment: "Strong ICP fit",
      edge_cases: [],
      confidence: 92,
    },
    intent: {
      score: 82,
      signals: [
        {
          signal: "Hiring 3 SREs",
          raw_score: 9,
          weighted_score: 9,
          recency_days: 5,
          reasoning: "Direct scaling-pain signal",
        },
      ],
      trajectory: "increasing",
      false_intent_flags: [],
      confidence: 88,
    },
    risk: {
      score: 12,
      risks: [
        {
          category: "Engagement",
          severity: "minor",
          description: "No previous engagement with your team",
          evidence: "No prior decisions on this prospect",
          mitigation: "Reference a specific recent signal",
        },
      ],
      red_flags: [],
      time_waste_probability: 15,
      mitigation_strategies: ["Reference recent post"],
      confidence: 85,
    },
    judge: {
      verdict: "STRONG_YES",
      confidence: 94,
      weighted_score: 94.2,
      agent_consensus: "high",
      conflicts: [],
      reasoning: "Series B fintech with strong ICP and intent match.",
      key_evidence: ["Series B stage", "Hiring 3 SREs", "K8s cost post"],
      message: {
        linkedin: "Hi Sarah — saw your recent post on scaling K8s...",
        email: null,
        tone: "professional",
        personalization_hooks: ["K8s scaling post", "Series B stage"],
      },
      recommended_action: "message_now",
      confidence_explanation: "High-quality, recent, specific data points.",
    },
  };
}

describe("agentDebateOutputSchema", () => {
  it("accepts the Bible §6.1/§10.2 worked example", () => {
    const result = agentDebateOutputSchema.safeParse(validDebateOutput());
    expect(result.success).toBe(true);
  });

  it("rejects an invalid verdict enum value", () => {
    const invalid = validDebateOutput();
    invalid.judge.verdict = "MAYBE" as never;
    expect(agentDebateOutputSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects confidence values outside 0-100", () => {
    const invalid = validDebateOutput();
    invalid.judge.confidence = 150;
    expect(agentDebateOutputSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects a missing agent section", () => {
    const invalid = validDebateOutput() as Partial<ReturnType<typeof validDebateOutput>>;
    delete invalid.risk;
    expect(agentDebateOutputSchema.safeParse(invalid).success).toBe(false);
  });

  // recommended_action: "pass_and_move_on" legitimately has nothing worth
  // drafting -- a null linkedin message must not fail validation the way it
  // used to (silently absorbed by orchestrator.ts's retry at ~90s a time).
  it("accepts a null linkedin message alongside pass_and_move_on", () => {
    const valid = validDebateOutput();
    valid.judge.recommended_action = "pass_and_move_on";
    valid.judge.message = {
      linkedin: null as unknown as string,
      email: null,
      tone: "professional",
      personalization_hooks: [],
    };
    expect(agentDebateOutputSchema.safeParse(valid).success).toBe(true);
  });

  // A fully-null message is only legitimate alongside pass_and_move_on --
  // for any other recommended_action, both channels null means the model
  // genuinely failed to draft anything, not that it made an honest "nothing
  // worth sending" call. Loosening linkedin to nullable (above) must not
  // have quietly dropped this as a validation failure worth retrying.
  it("rejects a fully-null message when recommended_action isn't pass_and_move_on", () => {
    const invalid = validDebateOutput();
    invalid.judge.recommended_action = "message_now";
    invalid.judge.message = {
      linkedin: null as unknown as string,
      email: null,
      tone: "professional",
      personalization_hooks: [],
    };
    expect(agentDebateOutputSchema.safeParse(invalid).success).toBe(false);
  });
});
