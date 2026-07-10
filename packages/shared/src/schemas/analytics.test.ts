import { describe, expect, it } from "vitest";
import { analyticsEventSchema } from "./analytics.js";

describe("analyticsEventSchema", () => {
  it("accepts a valid verdict_generated event (Bible §11.1)", () => {
    const result = analyticsEventSchema.safeParse({
      name: "verdict_generated",
      properties: {
        decision_id: "dec_1",
        verdict: "STRONG_YES",
        confidence: 94,
        processing_time_ms: 3200,
        agent_consensus: "high",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a valid event name with the wrong property shape", () => {
    const result = analyticsEventSchema.safeParse({
      name: "verdict_generated",
      properties: { decision_id: "dec_1" }, // missing required fields
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown event name", () => {
    const result = analyticsEventSchema.safeParse({
      name: "made_up_event",
      properties: {},
    });
    expect(result.success).toBe(false);
  });

  it("accepts outcome_logged with a nullable time_to_outcome_days", () => {
    const result = analyticsEventSchema.safeParse({
      name: "outcome_logged",
      properties: {
        decision_id: "dec_1",
        outcome_type: "MEETING_BOOKED",
        time_to_outcome_days: null,
        feedback_provided: true,
      },
    });
    expect(result.success).toBe(true);
  });
});
