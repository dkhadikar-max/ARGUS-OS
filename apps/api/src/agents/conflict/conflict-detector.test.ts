import { describe, expect, it } from "vitest";
import { computeBaseConflict, scoreDirection } from "./conflict-detector.js";

describe("scoreDirection", () => {
  it("is positive above 65", () => {
    expect(scoreDirection(66)).toBe("positive");
    expect(scoreDirection(100)).toBe("positive");
  });

  it("is negative below 35", () => {
    expect(scoreDirection(34)).toBe("negative");
    expect(scoreDirection(0)).toBe("negative");
  });

  it("is neutral at and between the thresholds", () => {
    expect(scoreDirection(35)).toBe("neutral");
    expect(scoreDirection(50)).toBe("neutral");
    expect(scoreDirection(65)).toBe("neutral");
  });
});

describe("computeBaseConflict", () => {
  it("reports low cv/spread and no directional conflict when all three agents agree", () => {
    const result = computeBaseConflict({ icpScore: 80, intentScore: 85, riskSafetyScore: 78 });

    expect(result.directional).toBe(false);
    expect(result.spread).toBeLessThan(10);
    expect(result.cv).toBeLessThan(0.1);
  });

  it("flags directional conflict when one score is positive and another is negative", () => {
    const result = computeBaseConflict({ icpScore: 90, intentScore: 20, riskSafetyScore: 60 });

    expect(result.directional).toBe(true);
  });

  it("does not flag directional conflict when disagreement stays within the neutral band", () => {
    const result = computeBaseConflict({ icpScore: 60, intentScore: 45, riskSafetyScore: 55 });

    expect(result.directional).toBe(false);
  });

  it("returns cv 0 instead of NaN when all scores are zero", () => {
    const result = computeBaseConflict({ icpScore: 0, intentScore: 0, riskSafetyScore: 0 });

    expect(result.cv).toBe(0);
    expect(Number.isNaN(result.cv)).toBe(false);
  });
});
