import { describe, expect, it } from "vitest";
import { calculateDecisionValue, calculateInferenceCostUsd, calculateValueCostRatio } from "./decision-value.service.js";

describe("calculateInferenceCostUsd", () => {
  it("matches the Bible's own worked example: 4K input + 2K output = ~$0.042", () => {
    const cost = calculateInferenceCostUsd(4000, 2000);
    expect(cost).toBeCloseTo(0.042, 3);
  });

  it("returns 0 for zero tokens (e.g. a cache-hit decision)", () => {
    expect(calculateInferenceCostUsd(0, 0)).toBe(0);
  });
});

describe("calculateDecisionValue", () => {
  it("gives PASS/HARD_PASS the highest time-saved baseline (2.5h) with no outcome yet", () => {
    const pass = calculateDecisionValue({ verdict: "PASS", outcomeType: null });
    const hardPass = calculateDecisionValue({ verdict: "HARD_PASS", outcomeType: null });
    expect(pass.timeSavedHours).toBe(2.5);
    expect(hardPass.timeSavedHours).toBe(2.5);
    expect(pass.decisionValueUsd).toBe(2.5 * 75);
  });

  it("gives STRONG_YES/YES a lower time-saved baseline (1.0h)", () => {
    const result = calculateDecisionValue({ verdict: "STRONG_YES", outcomeType: null });
    expect(result.timeSavedHours).toBe(1.0);
  });

  it("gives WAIT the lowest baseline (0.5h)", () => {
    const result = calculateDecisionValue({ verdict: "WAIT", outcomeType: null });
    expect(result.timeSavedHours).toBe(0.5);
  });

  it("credits revenue only when the outcome is CLOSED_WON", () => {
    const won = calculateDecisionValue({ verdict: "YES", outcomeType: "CLOSED_WON" });
    const notWon = calculateDecisionValue({ verdict: "YES", outcomeType: "MEETING_BOOKED" });
    expect(won.revenueInfluencedUsd).toBe(25000);
    expect(notWon.revenueInfluencedUsd).toBe(0);
  });

  it("credits false-positive reduction only for PASS/HARD_PASS + NO_RESPONSE", () => {
    const correct = calculateDecisionValue({ verdict: "PASS", outcomeType: "NO_RESPONSE" });
    const wrongVerdict = calculateDecisionValue({ verdict: "YES", outcomeType: "NO_RESPONSE" });
    const wrongOutcome = calculateDecisionValue({ verdict: "PASS", outcomeType: "MEETING_BOOKED" });
    expect(correct.fpReduction).toBe(1);
    expect(wrongVerdict.fpReduction).toBe(0);
    expect(wrongOutcome.fpReduction).toBe(0);
  });

  it("credits false-negative reduction only for STRONG_YES/YES + CLOSED_WON", () => {
    const caught = calculateDecisionValue({ verdict: "STRONG_YES", outcomeType: "CLOSED_WON" });
    const wrongVerdict = calculateDecisionValue({ verdict: "PASS", outcomeType: "CLOSED_WON" });
    expect(caught.fnReduction).toBe(1);
    expect(wrongVerdict.fnReduction).toBe(0);
  });

  it("computes the full formula for a STRONG_YES that closed", () => {
    const result = calculateDecisionValue({ verdict: "STRONG_YES", outcomeType: "CLOSED_WON" });
    // time_saved*75 + revenue*0.05 + fp*150 + fn*5000
    const expected = 1.0 * 75 + 25000 * 0.05 + 0 * 150 + 1 * 5000;
    expect(result.decisionValueUsd).toBeCloseTo(expected);
  });
});

describe("calculateValueCostRatio", () => {
  it("divides decision value by inference cost", () => {
    expect(calculateValueCostRatio(187.5, 0.042)).toBeCloseTo(187.5 / 0.042);
  });

  it("returns null instead of Infinity when inference cost is 0 (cache hit)", () => {
    expect(calculateValueCostRatio(187.5, 0)).toBeNull();
  });
});
