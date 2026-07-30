/**
 * Gate 2 Replay -- resume + merge.
 *
 * Batch A (replayId af57c00e-d04c-464b-ad62-42b8aab42e71, 2026-07-30) ran
 * all 51 fixtures for real but the Anthropic account ran out of credits
 * mid-run (see GATE2_REPLAY_REPORT.md) -- 10 fixtures got a real,
 * complete old-vs-new comparison; 41 failed identically on both runtimes
 * with a billing error, not an architecture defect.
 *
 * This script runs ONLY those 41 named fixtures for real (not the 10
 * already-valid ones -- no reason to spend that budget twice), reusing
 * run-replay.ts's real, already-unit-tested comparison/aggregation logic
 * and its own artifact-persistence convention unchanged, then merges the
 * new 41 results with Batch A's 10 valid ones into ONE final 51-fixture
 * ReplayReport -- the actual Gate 2 deliverable REPLAY_METHODOLOGY.md v3
 * defines (results over the full frozen 51-fixture set, not a subset).
 *
 * Usage: npx tsx eval/run-replay-resume.ts
 */
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentDebateWithController, type ExecutionRuntimeResult } from "../src/agents/execution-runtime.js";
import { evaluate, type DecisionEngineResult } from "../src/agents/decision-engine.js";
import { SALES_LEAD_QUALIFICATION_PACK } from "../src/agents/decision-pack.js";
import { CLAUDE_MODEL } from "../src/agents/claude-client.js";
import { DEFAULT_CONTROLLER_POLICY } from "../src/agents/controller.js";
import type { ExecutionIdentity } from "../src/agents/reasoning-capability.js";
import {
  normalizeOldResult,
  normalizeNewResult,
  errorOutcome,
  compareResults,
  aggregateReport,
  computeFixtureSetHash,
  persistDisagreementArtifacts,
} from "./run-replay.js";
import type { EvalFixture, ReplayReport, ReplayFixtureResult, ReplayThresholds, ReplayMetadata } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");
const RUNS_DIR = join(__dirname, "runs");

// Batch A's real, already-spent, already-valid run -- reused, not redone.
const BATCH_A_REPORT_PATH = join(RUNS_DIR, "replay_af57c00e-d04c-464b-ad62-42b8aab42e71.json");
const BATCH_A_REPLAY_ID = "af57c00e-d04c-464b-ad62-42b8aab42e71";

// The exact 41 fixtures that failed on runtime_error in Batch A -- pulled
// directly from its own disagreementBreakdown, not retyped by hand.
const RESUME_FIXTURES: readonly string[] = [
  "edge-title-partial-match",
  "matrix-icp-moderate_intent-cold_risk-clean",
  "matrix-icp-moderate_intent-cold_risk-moderate",
  "matrix-icp-moderate_intent-cold_risk-severe",
  "matrix-icp-moderate_intent-hot_risk-clean",
  "matrix-icp-moderate_intent-hot_risk-moderate",
  "matrix-icp-moderate_intent-hot_risk-severe",
  "matrix-icp-moderate_intent-none_risk-clean",
  "matrix-icp-moderate_intent-none_risk-moderate",
  "matrix-icp-moderate_intent-none_risk-severe",
  "matrix-icp-moderate_intent-warm_risk-clean",
  "matrix-icp-moderate_intent-warm_risk-moderate",
  "matrix-icp-moderate_intent-warm_risk-severe",
  "matrix-icp-strong_intent-cold_risk-clean",
  "matrix-icp-strong_intent-cold_risk-moderate",
  "matrix-icp-strong_intent-cold_risk-severe",
  "matrix-icp-strong_intent-hot_risk-clean",
  "matrix-icp-strong_intent-hot_risk-moderate",
  "matrix-icp-strong_intent-hot_risk-severe",
  "matrix-icp-strong_intent-none_risk-clean",
  "matrix-icp-strong_intent-none_risk-moderate",
  "matrix-icp-strong_intent-none_risk-severe",
  "matrix-icp-strong_intent-warm_risk-clean",
  "matrix-icp-strong_intent-warm_risk-moderate",
  "matrix-icp-strong_intent-warm_risk-severe",
  "matrix-icp-weak_intent-cold_risk-clean",
  "matrix-icp-weak_intent-cold_risk-moderate",
  "matrix-icp-weak_intent-cold_risk-severe",
  "matrix-icp-weak_intent-hot_risk-clean",
  "matrix-icp-weak_intent-hot_risk-moderate",
  "matrix-icp-weak_intent-hot_risk-severe",
  "matrix-icp-weak_intent-none_risk-clean",
  "matrix-icp-weak_intent-none_risk-moderate",
  "matrix-icp-weak_intent-none_risk-severe",
  "matrix-icp-weak_intent-warm_risk-clean",
  "matrix-icp-weak_intent-warm_risk-moderate",
  "matrix-icp-weak_intent-warm_risk-severe",
  "moderate-fit-steady-growth",
  "sparse-data-placeholder",
  "strong-fit-hot-intent",
  "weak-fit-wrong-title",
];

const CONFIDENCE_DELTA_FLAG_THRESHOLD = 5; // same value run-replay.ts uses -- not a new threshold
const PROPOSED_THRESHOLDS: ReplayThresholds = {
  minVerdictAgreementRate: 0.99,
  maxConfidenceDeltaP95: 5,
  minControllerActionAgreementRate: 0.99,
  maxExecutionFailures: 0,
  maxSchemaValidationFailures: 0,
};

function currentGitCommit(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim();
  } catch {
    return null;
  }
}

async function main() {
  const batchA = JSON.parse(readFileSync(BATCH_A_REPORT_PATH, "utf-8")) as ReplayReport;
  const batchAValidResults = batchA.perFixtureResults.filter((r) => !r.disagreementCategories.includes("runtime_error"));
  console.log(`Loaded ${batchAValidResults.length} valid results from Batch A (${BATCH_A_REPLAY_ID}).`);
  console.log(`Resuming ${RESUME_FIXTURES.length} fixtures that failed on runtime_error.\n`);

  const fixtures: EvalFixture[] = RESUME_FIXTURES.map((name) => JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), "utf-8")) as EvalFixture);
  const identity: ExecutionIdentity = { teamId: "replay", userId: "replay", prospectId: "replay", prospectName: "Replay Fixture" };
  const resumedResults: ReplayFixtureResult[] = [];

  for (const fixture of fixtures) {
    console.log(`  ${fixture.name} ...`);

    let oldRaw: ExecutionRuntimeResult | null = null;
    let oldNorm;
    try {
      oldRaw = await runAgentDebateWithController(fixture.input, identity);
      oldNorm = normalizeOldResult(oldRaw);
    } catch (err) {
      oldNorm = errorOutcome(err);
    }

    let newRaw: DecisionEngineResult | null = null;
    let newNorm;
    try {
      newRaw = await evaluate(SALES_LEAD_QUALIFICATION_PACK, fixture.input, identity);
      newNorm = normalizeNewResult(newRaw);
    } catch (err) {
      newNorm = errorOutcome(err);
    }

    const result = compareResults(fixture.name, oldNorm, newNorm, CONFIDENCE_DELTA_FLAG_THRESHOLD);
    resumedResults.push(result);
    console.log(`    verdict: ${result.verdictAgreement ? "agree" : "DISAGREE"} (${result.oldVerdict} vs ${result.newVerdict})`);

    if (result.disagreementCategories.length > 0 && oldRaw && newRaw) {
      persistDisagreementArtifacts(BATCH_A_REPLAY_ID, fixture.name, oldRaw, newRaw);
    }

    if (result.disagreementCategories.includes("schema_error")) {
      console.error(`Schema error on fixture "${fixture.name}" -- aborting per REPLAY_METHODOLOGY.md's stop conditions.`);
      break;
    }
  }

  const stillFailed = resumedResults.filter((r) => r.disagreementCategories.includes("runtime_error"));
  if (stillFailed.length > 0) {
    console.warn(`\n${stillFailed.length} fixture(s) still failed after resume: ${stillFailed.map((r) => r.fixture).join(", ")}`);
  }

  const merged: ReplayFixtureResult[] = [...batchAValidResults, ...resumedResults];
  const resumedCost = resumedResults.reduce((s, r) => s + r.oldCostUsd + r.newCostUsd, 0);

  const metadata: ReplayMetadata = {
    replayId: randomUUID(),
    codebaseCommit: currentGitCommit(),
    fixtureSetHash: computeFixtureSetHash([...batchAValidResults, ...resumedResults].map((r) => `${r.fixture}.json`).sort()),
    fixtureCount: merged.length,
    model: CLAUDE_MODEL,
    promptsCommit: batchA.metadata.promptsCommit,
    decisionPackVersion: SALES_LEAD_QUALIFICATION_PACK.version,
    controllerPolicyVersion: DEFAULT_CONTROLLER_POLICY.version,
    runAt: new Date().toISOString(),
    actualCostUsd: batchA.metadata.actualCostUsd + resumedCost,
  };

  const finalReport = aggregateReport(metadata, PROPOSED_THRESHOLDS, merged);

  mkdirSync(RUNS_DIR, { recursive: true });
  const outPath = join(RUNS_DIR, `replay_${finalReport.metadata.replayId}_final.json`);
  writeFileSync(outPath, JSON.stringify(finalReport, null, 2));

  console.log(`\nResumed batch cost: $${resumedCost.toFixed(4)} for ${resumedResults.length} fixtures`);
  console.log(`Combined total cost (Batch A + resume): $${metadata.actualCostUsd.toFixed(4)}`);
  console.log(`Final merged fixture count: ${merged.length} (expected 51)`);
  console.log(`\n${finalReport.passed ? "PASSED" : "BLOCKED"}: ${finalReport.failureReasons.join("; ") || "all thresholds met"}`);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
