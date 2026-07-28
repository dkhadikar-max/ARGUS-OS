import { describe, expect, it, vi } from "vitest";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareResults,
  aggregateReport,
  computeFixtureSetHash,
  errorOutcome,
  type NormalizedRunOutcome,
} from "./run-replay.js";
import type { AgentDebateOutput } from "@argus/shared";
import type { ReplayThresholds } from "./types.js";

// run-replay.ts's own module-level import chain (execution-runtime.ts ->
// orchestrator.ts -> claude-client.ts, decision-engine.ts and everything
// it pulls in) is real and heavy -- first-import compilation under tsx is
// genuinely slow on Windows, same root cause registry.test.ts already
// documented for its own real git-log execSync calls. Raised per-file, not
// globally, since every other test file's own import chain is lighter.
vi.setConfig({ testTimeout: 15000 });

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

function judgeOutput(overrides: Partial<AgentDebateOutput["judge"]> = {}): AgentDebateOutput["judge"] {
  return {
    verdict: "YES",
    confidence: 80,
    weighted_score: 78,
    agent_consensus: "high",
    conflicts: [],
    reasoning: "ok",
    key_evidence: [],
    message: { linkedin: null, email: null, tone: "professional", personalization_hooks: [] },
    recommended_action: "message_now",
    confidence_explanation: "ok",
    ...overrides,
  };
}

function fakeOutput(overrides: Partial<AgentDebateOutput> = {}, judgeOverrides: Partial<AgentDebateOutput["judge"]> = {}): AgentDebateOutput {
  return {
    research: { summary: "s", data_points: [{ type: "firmographic", signal: "sig1", relevance: "r" }], unfair_advantages: [], hidden_risks: [], confidence: 80, data_gaps: [] },
    icp: { score: 80, criteria_evaluated: [], overall_assessment: "ok", edge_cases: [], confidence: 80 },
    intent: { score: 70, signals: [], trajectory: "stable", false_intent_flags: [], confidence: 75 },
    risk: { score: 10, risks: [], red_flags: [], time_waste_probability: 10, mitigation_strategies: [], confidence: 80 },
    judge: judgeOutput(judgeOverrides),
    ...overrides,
  };
}

function outcome(overrides: Partial<NormalizedRunOutcome> = {}): NormalizedRunOutcome {
  return {
    output: fakeOutput(),
    processingTimeMs: 1000,
    inputTokens: 100,
    outputTokens: 100,
    costUsd: 0.001,
    controllerAction: "stop",
    controllerTargetCapability: null,
    error: null,
    ...overrides,
  };
}

describe("compareResults", () => {
  it("reports agreement on every dimension when both runtimes produce identical real output", () => {
    const result = compareResults("f1", outcome(), outcome(), 5);

    expect(result.verdictAgreement).toBe(true);
    expect(result.controllerActionAgreement).toBe(true);
    expect(result.researchSignalsAgreement).toBe(true);
    expect(result.disagreementCategories).toEqual([]);
  });

  it("flags verdict_mismatch when verdicts differ", () => {
    const old = outcome();
    const fresh = outcome({ output: fakeOutput({}, { verdict: "PASS" }) });
    const result = compareResults("f1", old, fresh, 5);

    expect(result.verdictAgreement).toBe(false);
    expect(result.disagreementCategories).toContain("verdict_mismatch");
  });

  it("flags confidence_threshold_exceeded only when the real delta exceeds the given threshold", () => {
    const old = outcome({ output: fakeOutput({}, { confidence: 80 }) });
    const closeCall = outcome({ output: fakeOutput({}, { confidence: 83 }) }); // delta 3, threshold 5
    const overThreshold = outcome({ output: fakeOutput({}, { confidence: 90 }) }); // delta 10

    expect(compareResults("f1", old, closeCall, 5).disagreementCategories).not.toContain("confidence_threshold_exceeded");
    expect(compareResults("f1", old, overThreshold, 5).disagreementCategories).toContain("confidence_threshold_exceeded");
  });

  it("flags controller_action_mismatch on differing action, and on matching invoke_capability action with a different target", () => {
    const old = outcome({ controllerAction: "stop" });
    const differentAction = outcome({ controllerAction: "invoke_capability", controllerTargetCapability: "risk" });
    expect(compareResults("f1", old, differentAction, 5).disagreementCategories).toContain("controller_action_mismatch");

    const oldInvoke = outcome({ controllerAction: "invoke_capability", controllerTargetCapability: "risk" });
    const differentTarget = outcome({ controllerAction: "invoke_capability", controllerTargetCapability: "icp" });
    expect(compareResults("f1", oldInvoke, differentTarget, 5).disagreementCategories).toContain("controller_action_mismatch");

    const sameTarget = outcome({ controllerAction: "invoke_capability", controllerTargetCapability: "risk" });
    expect(compareResults("f1", oldInvoke, sameTarget, 5).disagreementCategories).not.toContain("controller_action_mismatch");
  });

  it("flags runtime_error and skips every other check when either side genuinely failed", () => {
    const old = outcome();
    const failed = errorOutcome(new Error("real provider failure"));
    const result = compareResults("f1", old, failed, 5);

    expect(result.disagreementCategories).toEqual(["runtime_error"]);
    expect(result.error).toBe("real provider failure");
    // No other category is claimed when there's nothing real to compare.
    expect(result.verdictAgreement).toBe(false);
    expect(result.controllerActionAgreement).toBe(false);
  });

  it("researchSignalsAgreement compares as a SET (Layer 2), not exact array order", () => {
    const reordered = outcome({
      output: fakeOutput({
        research: {
          summary: "s",
          data_points: [
            { type: "intent", signal: "sig2", relevance: "r" },
            { type: "firmographic", signal: "sig1", relevance: "r" },
          ],
          unfair_advantages: [],
          hidden_risks: [],
          confidence: 80,
          data_gaps: [],
        },
      }),
    });
    const original = outcome({
      output: fakeOutput({
        research: {
          summary: "s",
          data_points: [
            { type: "firmographic", signal: "sig1", relevance: "r" },
            { type: "intent", signal: "sig2", relevance: "r" },
          ],
          unfair_advantages: [],
          hidden_risks: [],
          confidence: 80,
          data_gaps: [],
        },
      }),
    });

    expect(compareResults("f1", original, reordered, 5).researchSignalsAgreement).toBe(true);
  });
});

describe("aggregateReport", () => {
  const thresholds: ReplayThresholds = {
    minVerdictAgreementRate: 0.99,
    maxConfidenceDeltaP95: 5,
    minControllerActionAgreementRate: 0.99,
    maxExecutionFailures: 0,
    maxSchemaValidationFailures: 0,
  };

  function fakeMetadata() {
    return {
      replayId: "test-id",
      codebaseCommit: "abc123",
      fixtureSetHash: "hash",
      fixtureCount: 2,
      model: "claude-test",
      promptsCommit: "def456",
      decisionPackVersion: "1",
      controllerPolicyVersion: 0,
      runAt: new Date().toISOString(),
      actualCostUsd: 0.5,
    };
  }

  it("computes passed=true and empty failureReasons when every real metric meets threshold", () => {
    const results = [
      compareResults("f1", outcome(), outcome(), 5),
      compareResults("f2", outcome(), outcome(), 5),
    ];
    const report = aggregateReport(fakeMetadata(), thresholds, results);

    expect(report.passed).toBe(true);
    expect(report.failureReasons).toEqual([]);
    expect(report.aggregateMetrics.verdictAgreementRate).toBe(1);
  });

  it("computes passed=false with a real, specific reason when verdict agreement is below threshold", () => {
    const results = [
      compareResults("f1", outcome(), outcome(), 5),
      compareResults("f2", outcome(), outcome({ output: fakeOutput({}, { verdict: "PASS" }) }), 5),
    ];
    const report = aggregateReport(fakeMetadata(), thresholds, results);

    expect(report.passed).toBe(false);
    expect(report.failureReasons.some((r) => r.includes("verdict agreement"))).toBe(true);
  });

  it("disagreementBreakdown is computed by aggregating each fixture's own categories, not maintained separately", () => {
    const results = [
      compareResults("f1", outcome(), outcome({ output: fakeOutput({}, { verdict: "PASS" }) }), 5),
      compareResults("f2", outcome(), outcome(), 5),
    ];
    const report = aggregateReport(fakeMetadata(), thresholds, results);

    const verdictMismatch = report.disagreementBreakdown.find((b) => b.category === "verdict_mismatch");
    expect(verdictMismatch?.count).toBe(1);
    expect(verdictMismatch?.fixtures).toEqual(["f1"]);

    const controllerMismatch = report.disagreementBreakdown.find((b) => b.category === "controller_action_mismatch");
    expect(controllerMismatch?.count).toBe(0);
    expect(controllerMismatch?.fixtures).toEqual([]);
  });

  it("returns real zero values (not NaN) for an empty perFixtureResults list", () => {
    const report = aggregateReport(fakeMetadata(), thresholds, []);
    expect(report.aggregateMetrics.verdictAgreementRate).toBe(0);
    expect(report.aggregateMetrics.confidenceDeltaP50).toBe(0);
  });
});

describe("computeFixtureSetHash", () => {
  it("reproduces the exact hash already published in GATE2_REPLAY_AUTHORIZATION.md for the current real fixture set", () => {
    const files = readdirSync(FIXTURES_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();

    expect(files).toHaveLength(51);
    expect(computeFixtureSetHash(files)).toBe("1B0A70833B6D7044EF6C0526C90DD2ABA0F9D1338FB8C1F272F374A6E0BD7DDA");
  });
});
