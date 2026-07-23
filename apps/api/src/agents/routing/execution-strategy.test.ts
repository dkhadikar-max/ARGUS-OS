import { describe, expect, it } from "vitest";
import { compareExecutionStrategies, determineExecutionStrategy } from "./execution-strategy.js";

const DEFAULT_THRESHOLDS = { cvThreshold: 0.25, maxSurpriseThreshold: 0.7 };

describe("determineExecutionStrategy", () => {
  it("returns single_pass when there's no conflict signal at all", () => {
    const strategy = determineExecutionStrategy({ cv: 0.1, maxSurprise: 0.2, directional: false }, DEFAULT_THRESHOLDS);
    expect(strategy).toBe("single_pass");
  });

  it("returns micro_debate when cv exceeds the threshold but surprise isn't extreme", () => {
    const strategy = determineExecutionStrategy({ cv: 0.4, maxSurprise: 0.3, directional: false }, DEFAULT_THRESHOLDS);
    expect(strategy).toBe("micro_debate");
  });

  it("returns micro_debate for a directional conflict below the executive-surprise floor", () => {
    const strategy = determineExecutionStrategy({ cv: 0.1, maxSurprise: 0.5, directional: true }, DEFAULT_THRESHOLDS);
    expect(strategy).toBe("micro_debate");
  });

  it("returns executive_debate when maxSurprise exceeds 0.9, regardless of thresholds", () => {
    const lenientThresholds = { cvThreshold: 0.9, maxSurpriseThreshold: 0.95 };
    const strategy = determineExecutionStrategy({ cv: 0.1, maxSurprise: 0.95, directional: false }, lenientThresholds);
    expect(strategy).toBe("executive_debate");
  });

  it("respects a team's stricter-than-default cvThreshold", () => {
    const strictThresholds = { cvThreshold: 0.05, maxSurpriseThreshold: 0.7 };
    const strategy = determineExecutionStrategy({ cv: 0.1, maxSurprise: 0.2, directional: false }, strictThresholds);
    expect(strategy).toBe("micro_debate");
  });
});

describe("compareExecutionStrategies", () => {
  it("returns null for pending when there is no pending proposal", () => {
    const result = compareExecutionStrategies({ cv: 0.1, maxSurprise: 0.2, directional: false }, DEFAULT_THRESHOLDS, null);
    expect(result.pending).toBeNull();
  });

  it("shows a stricter pending proposal escalating a conflict the active thresholds would let through as single_pass", () => {
    const pendingThresholds = { cvThreshold: 0.05, maxSurpriseThreshold: 0.7 };
    const result = compareExecutionStrategies(
      { cv: 0.1, maxSurprise: 0.2, directional: false },
      DEFAULT_THRESHOLDS,
      pendingThresholds,
    );

    expect(result.active).toBe("single_pass");
    expect(result.pending).toBe("micro_debate");
  });
});
