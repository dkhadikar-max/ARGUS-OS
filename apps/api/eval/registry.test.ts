import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  recordBenchmarkRun,
  loadRegistry,
  compareBenchmarkRuns,
  findRegressions,
  type AnyBenchmarkManifest,
} from "./registry.js";
import type { CandidateRunResult, EvalRunManifest, EvalRunResult } from "./types.js";

// recordBenchmarkRun shells out to real `git log`/`git rev-parse` for its
// real version-pin fields (2-3 real process spawns per call) -- genuinely
// slow on Windows across the many calls this file makes, not a logic
// issue. Raised per-file rather than mocking git out: the whole point of
// several of these tests IS that the version pins are real.
vi.setConfig({ testTimeout: 15000 });

let tempDir: string;
let registryPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "argus-registry-test-"));
  registryPath = join(tempDir, "registry.jsonl");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function candidateResult(overrides: Partial<CandidateRunResult> = {}): CandidateRunResult {
  return {
    fixture: "f1",
    candidate: "pipeline",
    verdict: "YES",
    weightedScore: 80,
    confidence: 85,
    agentConsensus: "high",
    recommendedAction: "message_now",
    processingTimeMs: 90000,
    inputTokens: 4000,
    outputTokens: 2000,
    inferenceCostUsd: 0.05,
    decisionValueUsd: 187.5,
    valueCostRatio: 3750,
    evidenceUtilizationRate: 0.8,
    confidenceCalibration: { consideredSparse: false, judgeConfidence: 85, ruleHeld: true },
    conflict: null,
    error: null,
    ...overrides,
  };
}

function candidateManifest(results: CandidateRunResult[], overrides: Partial<AnyBenchmarkManifest> = {}) {
  return {
    runId: "pipeline_test",
    createdAt: "2026-07-27T00:00:00.000Z",
    candidate: "pipeline" as const,
    model: "claude-sonnet-4-6",
    gitCommit: "abc1234",
    results,
    ...overrides,
  };
}

function evalResult(overrides: Partial<EvalRunResult> = {}): EvalRunResult {
  return {
    fixture: "f1",
    verdict: "YES",
    weightedScore: 70,
    confidence: 75,
    agentConsensus: "medium",
    recommendedAction: "message_now",
    processingTimeMs: 80000,
    error: null,
    ...overrides,
  };
}

function evalManifest(results: EvalRunResult[]): EvalRunManifest {
  return { runId: "eval_test", createdAt: "2026-07-27T00:00:00.000Z", model: "claude-sonnet-4-6", gitCommit: "abc1234", results };
}

describe("recordBenchmarkRun", () => {
  it("computes real cost/token/calibration metrics for a manifest that tracks them", () => {
    const manifest = candidateManifest([
      candidateResult({ processingTimeMs: 80000, inferenceCostUsd: 0.1, inputTokens: 4000, outputTokens: 2000 }),
      candidateResult({ processingTimeMs: 100000, inferenceCostUsd: 0.12, inputTokens: 4200, outputTokens: 2100 }),
    ]);

    const record = recordBenchmarkRun(manifest, registryPath);

    expect(record.metrics.fixtureCount).toBe(2);
    expect(record.metrics.errorCount).toBe(0);
    expect(record.metrics.successRate).toBe(1);
    expect(record.metrics.totalCostUsd).toBeCloseTo(0.22, 10);
    expect(record.metrics.avgCostUsd).toBeCloseTo(0.11, 10);
    expect(record.metrics.totalTokens).toBe(4000 + 2000 + 4200 + 2100);
    expect(record.metrics.calibrationHeldRate).toBe(1);
    expect(record.sourceKind).toBe("pipeline-candidate");
    expect(record.sourceRunId).toBe("pipeline_test");
  });

  it("leaves cost/token/calibration honestly null for a manifest that never tracked them", () => {
    const manifest = evalManifest([evalResult(), evalResult({ fixture: "f2" })]);

    const record = recordBenchmarkRun(manifest, registryPath);

    expect(record.metrics.totalCostUsd).toBeNull();
    expect(record.metrics.avgCostUsd).toBeNull();
    expect(record.metrics.totalTokens).toBeNull();
    expect(record.metrics.calibrationHeldRate).toBeNull();
    expect(record.sourceKind).toBe("eval-run");
  });

  it("excludes errored fixtures from success-based metrics but counts them in errorCount", () => {
    const manifest = candidateManifest([
      candidateResult(),
      candidateResult({ fixture: "f2", verdict: "ERROR", confidence: -1, weightedScore: -1, processingTimeMs: -1, error: "boom" }),
    ]);

    const record = recordBenchmarkRun(manifest, registryPath);

    expect(record.metrics.fixtureCount).toBe(2);
    expect(record.metrics.errorCount).toBe(1);
    expect(record.metrics.successRate).toBe(0.5);
    // The errored fixture's -1 sentinel values must not pollute the average.
    expect(record.metrics.avgConfidence).toBe(85);
  });

  it("real version pins: modelVersion from the manifest, controllerPolicyVersion from the real DEFAULT_CONTROLLER_POLICY", () => {
    const manifest = candidateManifest([candidateResult()]);
    const record = recordBenchmarkRun(manifest, registryPath);

    expect(record.modelVersion).toBe("claude-sonnet-4-6");
    expect(typeof record.controllerPolicyVersion).toBe("number");
    expect(record.codeVersion).toBe("abc1234"); // from manifest.gitCommit, not re-derived
  });

  it("appends real, immutable JSON Lines records -- loadRegistry reads them back in order", () => {
    recordBenchmarkRun(candidateManifest([candidateResult()], { runId: "run_1" }), registryPath);
    recordBenchmarkRun(candidateManifest([candidateResult()], { runId: "run_2" }), registryPath);

    const registry = loadRegistry(registryPath);

    expect(registry).toHaveLength(2);
    expect(registry[0]?.sourceRunId).toBe("run_1");
    expect(registry[1]?.sourceRunId).toBe("run_2");
  });
});

describe("loadRegistry", () => {
  it("returns an empty array when the registry file doesn't exist yet", () => {
    expect(loadRegistry(join(tempDir, "does-not-exist.jsonl"))).toEqual([]);
  });
});

describe("compareBenchmarkRuns", () => {
  it("computes real numeric deltas (candidate - baseline) for shared metrics", () => {
    const baseline = recordBenchmarkRun(candidateManifest([candidateResult({ inferenceCostUsd: 0.1 })], { runId: "baseline" }), registryPath);
    const candidate = recordBenchmarkRun(candidateManifest([candidateResult({ inferenceCostUsd: 0.15 })], { runId: "candidate" }), registryPath);

    const { deltas } = compareBenchmarkRuns(baseline.id, candidate.id, registryPath);

    expect(deltas.totalCostUsd).toBeCloseTo(0.05, 10);
    expect(deltas.avgCostUsd).toBeCloseTo(0.05, 10);
  });

  it("omits a metric from deltas when either side is null, rather than defaulting to 0", () => {
    const baseline = recordBenchmarkRun(evalManifest([evalResult()]), registryPath);
    const candidate = recordBenchmarkRun(candidateManifest([candidateResult()]), registryPath);

    const { deltas } = compareBenchmarkRuns(baseline.id, candidate.id, registryPath);

    expect(deltas.totalCostUsd).toBeUndefined();
    expect(deltas.successRate).toBeDefined();
  });

  it("throws a clear error for an unknown id, rather than silently comparing against undefined", () => {
    recordBenchmarkRun(candidateManifest([candidateResult()]), registryPath);
    expect(() => compareBenchmarkRuns("nonexistent", "also-nonexistent", registryPath)).toThrow(/No benchmark record/);
  });
});

describe("findRegressions", () => {
  it("finds a real consecutive-pair drop exceeding the threshold", async () => {
    recordBenchmarkRun(candidateManifest([candidateResult({ confidence: 90 })]), registryPath);
    await new Promise((r) => setTimeout(r, 2)); // ensure a distinct, later timestamp
    recordBenchmarkRun(candidateManifest([candidateResult({ confidence: 60 })]), registryPath);

    const regressions = findRegressions("avgConfidence", 20, registryPath);

    expect(regressions).toHaveLength(1);
    expect(regressions[0]?.delta).toBeCloseTo(-30, 10);
  });

  it("does not flag a drop within the threshold", async () => {
    recordBenchmarkRun(candidateManifest([candidateResult({ confidence: 90 })]), registryPath);
    await new Promise((r) => setTimeout(r, 2));
    recordBenchmarkRun(candidateManifest([candidateResult({ confidence: 85 })]), registryPath);

    expect(findRegressions("avgConfidence", 20, registryPath)).toEqual([]);
  });
});
