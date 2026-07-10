import { describe, expect, it } from "vitest";
import type { DecisionResponse } from "@argus/shared";
import { buildDecisionAlertBlocks } from "./decision-alert.js";

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
    ...overrides,
  };
}

describe("buildDecisionAlertBlocks", () => {
  it("includes prospect name, verdict, and confidence (Bible §6.4)", () => {
    const blocks = buildDecisionAlertBlocks(decision());
    const text = JSON.stringify(blocks);
    expect(text).toContain("Sarah Chen");
    expect(text).toContain("STRONG YES");
    expect(text).toContain("94% confidence");
  });

  it("renders all 4 action buttons with the decision id as value", () => {
    const blocks = buildDecisionAlertBlocks(decision());
    const actionsBlock = blocks.find((b) => b.type === "actions") as {
      elements: Array<{ action_id: string; value: string }>;
    };
    expect(actionsBlock.elements.map((e) => e.action_id)).toEqual([
      "decision_accept",
      "decision_edit",
      "decision_pass",
      "decision_view_more",
    ]);
    expect(actionsBlock.elements.every((e) => e.value === "dec_1")).toBe(true);
  });

  it("omits the message section when no message was generated", () => {
    const blocks = buildDecisionAlertBlocks(
      decision({ message: { linkedin: null, email: null, tone: "professional", personalizationHooks: [] } }),
    );
    const text = JSON.stringify(blocks);
    expect(text).not.toContain("Suggested message");
  });
});
