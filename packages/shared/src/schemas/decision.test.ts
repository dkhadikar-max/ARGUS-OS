import { describe, expect, it } from "vitest";
import { createDecisionRequestSchema, overrideDecisionRequestSchema } from "./decision.js";

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
