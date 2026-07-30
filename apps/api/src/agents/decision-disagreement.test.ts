import { describe, expect, it } from "vitest";
import { compareForShadow, type NormalizedShadowOutcome } from "./decision-disagreement.js";

function outcome(overrides: Partial<NormalizedShadowOutcome> = {}): NormalizedShadowOutcome {
  return {
    verdict: "YES",
    confidence: 80,
    controllerAction: "stop",
    controllerTargetCapability: null,
    ...overrides,
  };
}

describe("compareForShadow", () => {
  it("identical outcomes -- full agreement, no categories", () => {
    const { comparison, controllerComparisonApplicable } = compareForShadow(outcome(), outcome());

    expect(comparison.verdictAgreement).toBe(true);
    expect(comparison.confidenceDelta).toBe(0);
    expect(comparison.disagreementCategories).toEqual([]);
    expect(controllerComparisonApplicable).toBe(true);
  });

  it("verdict differs -- verdict_mismatch, and verdictAgreement is false", () => {
    const { comparison } = compareForShadow(outcome({ verdict: "YES" }), outcome({ verdict: "WAIT" }));

    expect(comparison.verdictAgreement).toBe(false);
    expect(comparison.disagreementCategories).toContain("verdict_mismatch");
  });

  it("confidence delta at or below threshold (5) does not flag", () => {
    const { comparison } = compareForShadow(outcome({ confidence: 80 }), outcome({ confidence: 85 }));

    expect(comparison.confidenceDelta).toBe(5);
    expect(comparison.disagreementCategories).not.toContain("confidence_threshold_exceeded");
  });

  it("confidence delta above threshold flags confidence_threshold_exceeded", () => {
    const { comparison } = compareForShadow(outcome({ confidence: 80 }), outcome({ confidence: 90 }));

    expect(comparison.confidenceDelta).toBe(10);
    expect(comparison.disagreementCategories).toContain("confidence_threshold_exceeded");
  });

  describe("controllerComparisonApplicable -- the concrete fix over naive reuse of Replay's compareResults", () => {
    it("live side has no controller action (legacy pipeline or cache hit) -- controller_action_mismatch is suppressed, controllerComparisonApplicable is false", () => {
      const oldR = outcome({ controllerAction: null, controllerTargetCapability: null });
      const newR = outcome({ controllerAction: "invoke_capability", controllerTargetCapability: "risk" });

      const { comparison, controllerComparisonApplicable } = compareForShadow(oldR, newR);

      expect(controllerComparisonApplicable).toBe(false);
      expect(comparison.disagreementCategories).not.toContain("controller_action_mismatch");
    });

    it("both sides have a real controller action and they differ -- controller_action_mismatch fires, controllerComparisonApplicable is true", () => {
      const oldR = outcome({ controllerAction: "stop", controllerTargetCapability: null });
      const newR = outcome({ controllerAction: "continue", controllerTargetCapability: null });

      const { comparison, controllerComparisonApplicable } = compareForShadow(oldR, newR);

      expect(controllerComparisonApplicable).toBe(true);
      expect(comparison.disagreementCategories).toContain("controller_action_mismatch");
    });

    it("both sides invoke_capability but target different capabilities -- still a mismatch", () => {
      const oldR = outcome({ controllerAction: "invoke_capability", controllerTargetCapability: "risk" });
      const newR = outcome({ controllerAction: "invoke_capability", controllerTargetCapability: "icp" });

      const { comparison } = compareForShadow(oldR, newR);

      expect(comparison.disagreementCategories).toContain("controller_action_mismatch");
    });

    it("both sides invoke_capability targeting the SAME capability -- agreement, no mismatch", () => {
      const oldR = outcome({ controllerAction: "invoke_capability", controllerTargetCapability: "risk" });
      const newR = outcome({ controllerAction: "invoke_capability", controllerTargetCapability: "risk" });

      const { comparison } = compareForShadow(oldR, newR);

      expect(comparison.disagreementCategories).not.toContain("controller_action_mismatch");
    });
  });
});
