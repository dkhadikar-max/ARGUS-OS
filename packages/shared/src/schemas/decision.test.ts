import { describe, expect, it } from "vitest";
import { createDecisionRequestSchema, decisionResponseSchema, editMessageDraftRequestSchema, overrideDecisionRequestSchema } from "./decision.js";

describe("createDecisionRequestSchema", () => {
  const baseRequest = {
    prospect: {
      linkedInUrl: "https://linkedin.com/in/sarahchen",
      name: "Sarah Chen",
      title: "VP Engineering",
      companyName: "DataFlow Inc.",
      companyDomain: "dataflow.io",
    },
    context: {
      source: "linkedin_sidebar",
      trigger: "profile_view",
      userId: "user_123",
      teamId: "team_456",
    },
  };

  it("applies Bible §10.2 defaults when options is omitted", () => {
    const result = createDecisionRequestSchema.parse(baseRequest);
    expect(result.options).toEqual({
      generateMessage: true,
      messageChannel: "LINKEDIN",
      messageTone: "professional",
      includeDebate: false,
    });
  });

  it("rejects a non-URL linkedInUrl", () => {
    const invalid = { ...baseRequest, prospect: { ...baseRequest.prospect, linkedInUrl: "not-a-url" } };
    expect(createDecisionRequestSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects an unknown context.source", () => {
    const invalid = { ...baseRequest, context: { ...baseRequest.context, source: "email_client" } };
    expect(createDecisionRequestSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("editMessageDraftRequestSchema", () => {
  it("accepts a non-empty body", () => {
    expect(editMessageDraftRequestSchema.safeParse({ body: "Hi Sarah, edited version" }).success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(editMessageDraftRequestSchema.safeParse({ body: "" }).success).toBe(false);
  });

  it("rejects a missing body", () => {
    expect(editMessageDraftRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("decisionResponseSchema", () => {
  const baseResponse = {
    id: "dec_abc123",
    status: "completed",
    prospect: {
      name: "Sarah Chen",
      title: "VP Engineering",
      companyName: "DataFlow Inc.",
      linkedInUrl: "https://linkedin.com/in/sarahchen",
    },
    verdict: "STRONG_YES",
    confidence: 94,
    reasoning: "Strong across the board.",
    evidence: [],
    message: { linkedin: "Hi Sarah", email: null, tone: "professional", personalizationHooks: [] },
    recommendedAction: "message_now",
    processingTimeMs: 3200,
    createdAt: "2026-07-10T14:32:00Z",
  };

  it("parses Bible §10.2's own worked example, which omits debate entirely", () => {
    expect(decisionResponseSchema.safeParse(baseResponse).success).toBe(true);
  });

  it("accepts a null debate (a decision predating this field)", () => {
    expect(decisionResponseSchema.safeParse({ ...baseResponse, debate: null }).success).toBe(true);
  });

  it("accepts a full Bible §6.5 5-agent debate breakdown", () => {
    const debate = {
      research: { summary: "Solid fit.", data_points: [], unfair_advantages: [], hidden_risks: [], confidence: 88, data_gaps: [] },
      icp: { score: 90, criteria_evaluated: [], overall_assessment: "Great", edge_cases: [], confidence: 90 },
      intent: { score: 80, signals: [], trajectory: "increasing", false_intent_flags: [], confidence: 85 },
      risk: { score: 10, risks: [], red_flags: [], time_waste_probability: 10, mitigation_strategies: [], confidence: 85 },
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
    expect(decisionResponseSchema.safeParse({ ...baseResponse, debate }).success).toBe(true);
  });

  it("rejects a malformed debate object", () => {
    expect(decisionResponseSchema.safeParse({ ...baseResponse, debate: { research: "not an object" } }).success).toBe(false);
  });
});

describe("overrideDecisionRequestSchema", () => {
  it("accepts a verdict override with a reason (Bible §10.2 example)", () => {
    const result = overrideDecisionRequestSchema.safeParse({
      newVerdict: "PASS",
      reason: "They just signed with CompetitorX last month",
    });
    expect(result.success).toBe(true);
  });

  it("allows an omitted reason", () => {
    expect(overrideDecisionRequestSchema.safeParse({ newVerdict: "WAIT" }).success).toBe(true);
  });
});
