/**
 * Gate 2 (Replay) runner -- REPLAY_METHODOLOGY.md v1 is the protocol this
 * implements; this file owns none of the methodology itself (disagreement
 * definitions, stop conditions, thresholds, what's recorded/ignored all
 * live in that document and in eval/types.ts's real types). Deliberately
 * "dumb": load frozen fixtures, run both real runtimes, compare, aggregate,
 * write the report. Nothing here defines what a disagreement IS -- that
 * logic lives in compareResults/aggregateReport below, which are pure
 * (zero API calls) and unit-tested (run-replay.test.ts) so the experiment's
 * own comparison logic is verified before it's ever run for real.
 *
 * NOT RUN as part of this change. Executing main() makes real, billable
 * Claude API calls against both runtimes for all 51 real fixtures (see
 * GATE2_REPLAY_AUTHORIZATION.md's cost estimate) -- requires the same
 * explicit authorization as any other live-spend action this project has
 * required all along.
 *
 * Usage (once authorized): npx tsx eval/run-replay.ts
 */
import { randomUUID, createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentDebateOutput } from "@argus/shared";
import { runAgentDebateWithController, type ExecutionRuntimeResult } from "../src/agents/execution-runtime.js";
import { evaluate, type DecisionEngineResult } from "../src/agents/decision-engine.js";
import { SALES_LEAD_QUALIFICATION_PACK } from "../src/agents/decision-pack.js";
import { CLAUDE_MODEL } from "../src/agents/claude-client.js";
import { DEFAULT_CONTROLLER_POLICY } from "../src/agents/controller.js";
import { calculateInferenceCostUsd } from "../src/agents/decision-value.service.js";
import type { ExecutionIdentity } from "../src/agents/reasoning-capability.js";
import type {
  EvalFixture,
  ReplayReport,
  ReplayMetadata,
  ReplayFixtureResult,
  ReplayAggregateMetrics,
  ReplayThresholds,
  DisagreementBreakdownEntry,
  DisagreementCategory,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");
const RUNS_DIR = join(__dirname, "runs");

// --- Pure logic (zero API calls) -- unit tested in run-replay.test.ts ---

export interface NormalizedRunOutcome {
  output: AgentDebateOutput | null;
  processingTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  controllerAction: string | null;
  controllerTargetCapability: string | null;
  error: string | null;
}

export function normalizeOldResult(result: ExecutionRuntimeResult): NormalizedRunOutcome {
  return {
    output: result.output,
    processingTimeMs: result.processingTimeMs,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    costUsd: calculateInferenceCostUsd(result.usage.inputTokens, result.usage.outputTokens),
    controllerAction: result.executionTrace.controllerDecision.action,
    controllerTargetCapability: result.executionTrace.controllerDecision.targetCapability ?? null,
    error: null,
  };
}

export function normalizeNewResult(result: DecisionEngineResult): NormalizedRunOutcome {
  return {
    output: result.output,
    processingTimeMs: result.processingTimeMs,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    costUsd: calculateInferenceCostUsd(result.usage.inputTokens, result.usage.outputTokens),
    controllerAction: result.controllerDecision.action,
    controllerTargetCapability: result.controllerDecision.targetCapability ?? null,
    error: null,
  };
}

export function errorOutcome(err: unknown): NormalizedRunOutcome {
  return {
    output: null,
    processingTimeMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    controllerAction: null,
    controllerTargetCapability: null,
    error: err instanceof Error ? err.message : String(err),
  };
}

/** REPLAY_METHODOLOGY.md §2: what counts as a disagreement. Pure -- no API
 *  calls, no I/O -- so this is the actual, directly-testable definition of
 *  "disagreement," not just prose. */
export function compareResults(
  fixtureName: string,
  oldR: NormalizedRunOutcome,
  newR: NormalizedRunOutcome,
  confidenceDeltaThreshold: number,
): ReplayFixtureResult {
  const categories: DisagreementCategory[] = [];
  const bothSucceeded = !oldR.error && !newR.error;

  if (oldR.error || newR.error) categories.push("runtime_error");

  const oldVerdict = oldR.output?.judge.verdict ?? "ERROR";
  const newVerdict = newR.output?.judge.verdict ?? "ERROR";
  const verdictAgreement = bothSucceeded && oldVerdict === newVerdict;
  if (bothSucceeded && !verdictAgreement) categories.push("verdict_mismatch");

  const oldConfidence = oldR.output?.judge.confidence ?? 0;
  const newConfidence = newR.output?.judge.confidence ?? 0;
  const confidenceDelta = Math.abs(oldConfidence - newConfidence);
  if (bothSucceeded && confidenceDelta > confidenceDeltaThreshold) categories.push("confidence_threshold_exceeded");

  const controllerActionAgreement =
    bothSucceeded &&
    oldR.controllerAction === newR.controllerAction &&
    (oldR.controllerAction !== "invoke_capability" || oldR.controllerTargetCapability === newR.controllerTargetCapability);
  if (bothSucceeded && !controllerActionAgreement) categories.push("controller_action_mismatch");

  const oldSignals = new Set(oldR.output?.research.data_points.map((d) => d.signal) ?? []);
  const newSignals = new Set(newR.output?.research.data_points.map((d) => d.signal) ?? []);
  const researchSignalsAgreement =
    bothSucceeded && oldSignals.size === newSignals.size && [...oldSignals].every((s) => newSignals.has(s));

  return {
    fixture: fixtureName,
    oldVerdict,
    newVerdict,
    verdictAgreement,
    oldConfidence,
    newConfidence,
    confidenceDelta,
    oldControllerAction: oldR.controllerAction ?? "error",
    newControllerAction: newR.controllerAction ?? "error",
    controllerActionAgreement,
    researchSignalsAgreement,
    oldLatencyMs: oldR.processingTimeMs,
    newLatencyMs: newR.processingTimeMs,
    oldCostUsd: oldR.costUsd,
    newCostUsd: newR.costUsd,
    error: oldR.error ?? newR.error,
    disagreementCategories: categories,
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))] as number;
}

const ALL_DISAGREEMENT_CATEGORIES: DisagreementCategory[] = [
  "verdict_mismatch",
  "confidence_threshold_exceeded",
  "controller_action_mismatch",
  "runtime_error",
  "schema_error",
  "missing_capability_output",
];

/** REPLAY_METHODOLOGY.md §5: aggregates real per-fixture results into the
 *  real report -- passed/failureReasons are computed here from
 *  aggregateMetrics vs. thresholds, never set by the caller. Pure -- no API
 *  calls. */
export function aggregateReport(metadata: ReplayMetadata, thresholds: ReplayThresholds, perFixtureResults: ReplayFixtureResult[]): ReplayReport {
  const n = perFixtureResults.length;
  const confidenceDeltas = perFixtureResults.filter((r) => !r.error).map((r) => r.confidenceDelta);

  const aggregateMetrics: ReplayAggregateMetrics = {
    verdictAgreementRate: n ? perFixtureResults.filter((r) => r.verdictAgreement).length / n : 0,
    confidenceDeltaP50: percentile(confidenceDeltas, 50),
    confidenceDeltaP95: percentile(confidenceDeltas, 95),
    controllerActionAgreementRate: n ? perFixtureResults.filter((r) => r.controllerActionAgreement).length / n : 0,
    researchSignalsAgreementRate: n ? perFixtureResults.filter((r) => r.researchSignalsAgreement).length / n : 0,
    avgOldLatencyMs: n ? perFixtureResults.reduce((s, r) => s + r.oldLatencyMs, 0) / n : 0,
    avgNewLatencyMs: n ? perFixtureResults.reduce((s, r) => s + r.newLatencyMs, 0) / n : 0,
    totalOldCostUsd: perFixtureResults.reduce((s, r) => s + r.oldCostUsd, 0),
    totalNewCostUsd: perFixtureResults.reduce((s, r) => s + r.newCostUsd, 0),
    executionFailureCount: perFixtureResults.filter((r) => r.disagreementCategories.includes("runtime_error")).length,
    schemaValidationFailureCount: perFixtureResults.filter((r) => r.disagreementCategories.includes("schema_error")).length,
  };

  const disagreementBreakdown: DisagreementBreakdownEntry[] = ALL_DISAGREEMENT_CATEGORIES.map((category) => {
    const fixtures = perFixtureResults.filter((r) => r.disagreementCategories.includes(category)).map((r) => r.fixture);
    return { category, count: fixtures.length, fixtures };
  });

  const failureReasons: string[] = [];
  if (aggregateMetrics.verdictAgreementRate < thresholds.minVerdictAgreementRate) {
    failureReasons.push(`verdict agreement ${(aggregateMetrics.verdictAgreementRate * 100).toFixed(1)}% below threshold ${(thresholds.minVerdictAgreementRate * 100).toFixed(1)}%`);
  }
  if (aggregateMetrics.confidenceDeltaP95 > thresholds.maxConfidenceDeltaP95) {
    failureReasons.push(`confidence delta P95 ${aggregateMetrics.confidenceDeltaP95} exceeds threshold ${thresholds.maxConfidenceDeltaP95}`);
  }
  if (aggregateMetrics.controllerActionAgreementRate < thresholds.minControllerActionAgreementRate) {
    failureReasons.push(`controller action agreement ${(aggregateMetrics.controllerActionAgreementRate * 100).toFixed(1)}% below threshold ${(thresholds.minControllerActionAgreementRate * 100).toFixed(1)}%`);
  }
  if (aggregateMetrics.executionFailureCount > thresholds.maxExecutionFailures) {
    failureReasons.push(`${aggregateMetrics.executionFailureCount} execution failures exceeds threshold ${thresholds.maxExecutionFailures}`);
  }
  if (aggregateMetrics.schemaValidationFailureCount > thresholds.maxSchemaValidationFailures) {
    failureReasons.push(`${aggregateMetrics.schemaValidationFailureCount} schema failures exceeds threshold ${thresholds.maxSchemaValidationFailures}`);
  }

  return { metadata, thresholds, aggregateMetrics, perFixtureResults, disagreementBreakdown, passed: failureReasons.length === 0, failureReasons };
}

/** SHA-256 of all real fixture files, sorted, concatenated -- same
 *  algorithm used to hand-compute GATE2_REPLAY_AUTHORIZATION.md's frozen
 *  hash. run-replay.test.ts asserts this function reproduces that exact,
 *  already-published value. */
export function computeFixtureSetHash(fixtureFiles: string[]): string {
  const hash = createHash("sha256");
  for (const file of fixtureFiles) {
    hash.update(readFileSync(join(FIXTURES_DIR, file), "utf-8"));
  }
  return hash.digest("hex").toUpperCase();
}

// --- Impure orchestration (real API calls) -- NOT run, NOT unit tested ---

function loadFixtureFiles(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

function loadFixtures(files: string[]): EvalFixture[] {
  return files.map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf-8")) as EvalFixture);
}

function currentGitCommit(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim();
  } catch {
    return null;
  }
}

function gitLastCommitTouching(pathFromEvalDir: string): string | null {
  try {
    return execSync(`git log -1 --format=%h -- "${pathFromEvalDir}"`, { cwd: __dirname }).toString().trim() || null;
  } catch {
    return null;
  }
}

// REPLAY_METHODOLOGY.md's proposed thresholds -- "proposed," not yet
// agreed (GATE2_REPLAY_AUTHORIZATION.md). Deliberately not silently
// treated as final: change here requires updating both documents.
const PROPOSED_THRESHOLDS: ReplayThresholds = {
  minVerdictAgreementRate: 0.99,
  maxConfidenceDeltaP95: 5,
  minControllerActionAgreementRate: 0.99,
  maxExecutionFailures: 0,
  maxSchemaValidationFailures: 0,
};
const CONFIDENCE_DELTA_FLAG_THRESHOLD = 5; // same number as maxConfidenceDeltaP95 -- one threshold, two uses (per-fixture flag + aggregate P95 check), not two undocumented values.

async function runReplay(identity: ExecutionIdentity): Promise<ReplayReport> {
  const fixtureFiles = loadFixtureFiles();
  const fixtures = loadFixtures(fixtureFiles);
  const perFixtureResults: ReplayFixtureResult[] = [];

  for (const fixture of fixtures) {
    console.log(`  ${fixture.name} ...`);

    let oldNorm: NormalizedRunOutcome;
    try {
      oldNorm = normalizeOldResult(await runAgentDebateWithController(fixture.input, identity));
    } catch (err) {
      oldNorm = errorOutcome(err);
    }

    let newNorm: NormalizedRunOutcome;
    try {
      newNorm = normalizeNewResult(await evaluate(SALES_LEAD_QUALIFICATION_PACK, fixture.input, identity));
    } catch (err) {
      newNorm = errorOutcome(err);
    }

    const result = compareResults(fixture.name, oldNorm, newNorm, CONFIDENCE_DELTA_FLAG_THRESHOLD);
    perFixtureResults.push(result);
    console.log(`    verdict: ${result.verdictAgreement ? "agree" : "DISAGREE"} (${result.oldVerdict} vs ${result.newVerdict})`);

    // REPLAY_METHODOLOGY.md §3: abort immediately on a real schema_error.
    if (result.disagreementCategories.includes("schema_error")) {
      console.error(`Schema error on fixture "${fixture.name}" -- aborting per REPLAY_METHODOLOGY.md's stop conditions.`);
      break;
    }
  }

  const metadata: ReplayMetadata = {
    replayId: randomUUID(),
    codebaseCommit: currentGitCommit(),
    fixtureSetHash: computeFixtureSetHash(fixtureFiles),
    fixtureCount: fixtures.length,
    model: CLAUDE_MODEL,
    promptsCommit: gitLastCommitTouching("../src/agents/prompts.ts"),
    decisionPackVersion: SALES_LEAD_QUALIFICATION_PACK.version,
    controllerPolicyVersion: DEFAULT_CONTROLLER_POLICY.version,
    runAt: new Date().toISOString(),
    actualCostUsd: perFixtureResults.reduce((s, r) => s + r.oldCostUsd + r.newCostUsd, 0),
  };

  return aggregateReport(metadata, PROPOSED_THRESHOLDS, perFixtureResults);
}

async function main() {
  console.warn(
    "Gate 2 Replay: this makes real, billable Claude API calls against both runtimes for every real fixture " +
      "(see GATE2_REPLAY_AUTHORIZATION.md's cost estimate). Do not run without explicit authorization.",
  );
  // Placeholder identity -- a real caller would supply this; not invented
  // beyond what every other real fixture-driven eval script already uses.
  const identity: ExecutionIdentity = { teamId: "replay", userId: "replay", prospectId: "replay", prospectName: "Replay Fixture" };
  const report = await runReplay(identity);

  mkdirSync(RUNS_DIR, { recursive: true });
  const outPath = join(RUNS_DIR, `replay_${report.metadata.replayId}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n${report.passed ? "PASSED" : "BLOCKED"}: ${report.failureReasons.join("; ") || "all thresholds met"}`);
  console.log(`Wrote ${outPath}`);
}

// Deliberately NOT invoked automatically on import (unlike every other
// eval/run*.ts script's own `main().catch(...)` convention) -- this file's
// pure functions are imported directly by run-replay.test.ts, and an
// auto-running main() would make every typecheck/import of this file a
// real API call. Explicit invocation only:
//   npx tsx -e "import('./eval/run-replay.js').then(m => m.main())"
// or a future one-line CLI wrapper, once authorized.
export { main, runReplay };
