import { describe, expect, it } from "vitest";
import {
  calculateComplexityScore,
  classifyVerdictCorrectness,
  computeWeightsFromLabeledDecisions,
  extractComplexityFeatures,
  type LabeledDecision,
} from "./decision-complexity.js";

describe("extractComplexityFeatures", () => {
  it("clamps cv into [0,1] and coerces directional to 0/1", () => {
    // icp=95 (positive), intent=5 (negative), risk=50 (neutral) -- a wide
    // spread that pushes cv above 1 in the raw computeBaseConflict math.
    const features = extractComplexityFeatures(
      { icpScore: 95, intentScore: 5, riskSafetyScore: 50 },
      { icp_intent: 0.1, icp_risk: 0.1, intent_risk: 0.1 },
    );
    expect(features.cv).toBeLessThanOrEqual(1);
    expect(features.cv).toBeGreaterThanOrEqual(0);
    expect(features.directional).toBe(1);
  });

  it("directional is 0 when no pair lands on opposite sides of neutral", () => {
    const features = extractComplexityFeatures(
      { icpScore: 60, intentScore: 55, riskSafetyScore: 58 },
      { icp_intent: 0.1, icp_risk: 0.1, intent_risk: 0.1 },
    );
    expect(features.directional).toBe(0);
  });
});

describe("calculateComplexityScore", () => {
  it("computes a weighted sum of the 3 features", () => {
    const score = calculateComplexityScore(
      { cv: 0.4, directional: 1, maxSurprise: 0.2 },
      { cv: 0.5, directional: 0.3, maxSurprise: 0.2 },
    );
    expect(score).toBeCloseTo(0.4 * 0.5 + 1 * 0.3 + 0.2 * 0.2, 10);
  });
});

describe("classifyVerdictCorrectness", () => {
  it("PASS/HARD_PASS + NO_RESPONSE is correct", () => {
    expect(classifyVerdictCorrectness("PASS", "NO_RESPONSE")).toBe("correct");
    expect(classifyVerdictCorrectness("HARD_PASS", "NO_RESPONSE")).toBe("correct");
  });

  it("PASS/HARD_PASS + a real opportunity outcome is wrong", () => {
    expect(classifyVerdictCorrectness("PASS", "MEETING_BOOKED")).toBe("wrong");
    expect(classifyVerdictCorrectness("HARD_PASS", "OPPORTUNITY_CREATED")).toBe("wrong");
    expect(classifyVerdictCorrectness("PASS", "CLOSED_WON")).toBe("wrong");
  });

  it("STRONG_YES/YES + CLOSED_WON is correct", () => {
    expect(classifyVerdictCorrectness("STRONG_YES", "CLOSED_WON")).toBe("correct");
    expect(classifyVerdictCorrectness("YES", "CLOSED_WON")).toBe("correct");
  });

  it("STRONG_YES/YES + NO_RESPONSE is wrong", () => {
    expect(classifyVerdictCorrectness("STRONG_YES", "NO_RESPONSE")).toBe("wrong");
    expect(classifyVerdictCorrectness("YES", "NO_RESPONSE")).toBe("wrong");
  });

  it("WAIT is always ambiguous, regardless of outcome", () => {
    expect(classifyVerdictCorrectness("WAIT", "CLOSED_WON")).toBe("ambiguous");
    expect(classifyVerdictCorrectness("WAIT", "NO_RESPONSE")).toBe("ambiguous");
  });

  it("less clear-cut outcome/verdict pairs are ambiguous, not guessed at", () => {
    expect(classifyVerdictCorrectness("PASS", "REPLIED_NO_MEETING")).toBe("ambiguous");
    expect(classifyVerdictCorrectness("YES", "CLOSED_LOST")).toBe("ambiguous");
    expect(classifyVerdictCorrectness("STRONG_YES", "DISQUALIFIED")).toBe("ambiguous");
    expect(classifyVerdictCorrectness("PASS", "SNOOZED")).toBe("ambiguous");
  });
});

function labeled(correctness: "correct" | "wrong", cv: number, directional: number, maxSurprise: number): LabeledDecision {
  return { correctness, features: { cv, directional, maxSurprise } };
}

describe("computeWeightsFromLabeledDecisions", () => {
  it("returns insufficient_data (not_enough_labeled_decisions) below the total minimum", () => {
    const decisions = [
      ...Array.from({ length: 5 }, () => labeled("correct", 0.1, 0, 0.1)),
      ...Array.from({ length: 5 }, () => labeled("wrong", 0.8, 1, 0.8)),
    ];
    const result = computeWeightsFromLabeledDecisions(decisions);
    expect(result.status).toBe("insufficient_data");
    expect(result.reason).toBe("not_enough_labeled_decisions");
    expect(result.labeledDecisionCount).toBe(10);
  });

  it("returns insufficient_data (not_enough_labeled_decisions) when one bucket is under the per-bucket minimum", () => {
    const decisions = [
      ...Array.from({ length: 18 }, () => labeled("correct", 0.1, 0, 0.1)),
      ...Array.from({ length: 2 }, () => labeled("wrong", 0.8, 1, 0.8)),
    ];
    const result = computeWeightsFromLabeledDecisions(decisions);
    expect(result.status).toBe("insufficient_data");
    expect(result.reason).toBe("not_enough_labeled_decisions");
  });

  it("returns insufficient_data (no_separating_signal) when correct and wrong decisions look identical", () => {
    const decisions = [
      ...Array.from({ length: 10 }, () => labeled("correct", 0.3, 0, 0.3)),
      ...Array.from({ length: 10 }, () => labeled("wrong", 0.3, 0, 0.3)),
    ];
    const result = computeWeightsFromLabeledDecisions(decisions);
    expect(result.status).toBe("insufficient_data");
    expect(result.reason).toBe("no_separating_signal");
  });

  it("proposes weights that sum to 1 and favor the feature most elevated on wrong decisions", () => {
    const decisions = [
      ...Array.from({ length: 10 }, () => labeled("correct", 0.1, 0, 0.1)),
      // cv is much more elevated on wrong decisions than directional/maxSurprise are.
      ...Array.from({ length: 10 }, () => labeled("wrong", 0.9, 0, 0.15)),
    ];
    const result = computeWeightsFromLabeledDecisions(decisions);

    expect(result.status).toBe("proposed");
    expect(result.weights).toBeDefined();
    const weights = result.weights!;
    expect(weights.cv + weights.directional + weights.maxSurprise).toBeCloseTo(1, 10);
    expect(weights.cv).toBeGreaterThan(weights.maxSurprise);
    expect(weights.directional).toBe(0); // no separation at all on this feature
  });

  it("clamps negative separation to 0 instead of producing a negative weight", () => {
    const decisions = [
      // cv is HIGHER on correct decisions than wrong ones here -- not a
      // "debate more" signal, so it must not pull weight negative.
      ...Array.from({ length: 10 }, () => labeled("correct", 0.8, 0, 0.1)),
      ...Array.from({ length: 10 }, () => labeled("wrong", 0.1, 1, 0.1)),
    ];
    const result = computeWeightsFromLabeledDecisions(decisions);

    expect(result.status).toBe("proposed");
    expect(result.weights!.cv).toBe(0);
    expect(result.weights!.directional).toBeGreaterThan(0);
  });
});
