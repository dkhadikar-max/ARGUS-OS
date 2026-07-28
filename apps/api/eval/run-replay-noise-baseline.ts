/**
 * Gate 2a -- Noise Baseline (REPLAY_METHODOLOGY.md v2 §1a).
 *
 * Runs the OLD runtime TWICE, independently, on the same fixture subset --
 * no new engine involved at all. Compares A vs B using the exact same
 * compareResults/aggregateReport logic run-replay.ts uses for Old-vs-New,
 * to measure how much disagreement comes purely from independent LLM
 * sampling on the SAME runtime. This number is the noise floor an
 * Old-vs-New Replay result must be interpreted against.
 *
 * Reuses run-replay.ts's real, already-unit-tested pure functions
 * unchanged -- adds no new comparison logic of its own.
 *
 * Usage: npx tsx eval/run-replay-noise-baseline.ts
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentDebateWithController } from "../src/agents/execution-runtime.js";
import { CLAUDE_MODEL } from "../src/agents/claude-client.js";
import { DEFAULT_CONTROLLER_POLICY } from "../src/agents/controller.js";
import { SALES_LEAD_QUALIFICATION_PACK } from "../src/agents/decision-pack.js";
import type { ExecutionIdentity } from "../src/agents/reasoning-capability.js";
import {
  normalizeOldResult,
  errorOutcome,
  compareResults,
  aggregateReport,
  computeFixtureSetHash,
} from "./run-replay.js";
import type { EvalFixture, ReplayMetadata, ReplayFixtureResult, ReplayThresholds } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");
const RUNS_DIR = join(__dirname, "runs");
const SAMPLE_SIZE = 5; // same subset, same order, as the Old-vs-New validation sample -- required for the two to be comparable
const CONFIDENCE_DELTA_FLAG_THRESHOLD = 5; // same value run-replay.ts uses -- not a new threshold

// Same proposed thresholds run-replay.ts uses, purely so `passed` is
// computed identically -- NOT a real pass/fail gate on the baseline itself.
// A baseline "failing" these thresholds is the whole point: it shows how
// much disagreement the SAME runtime produces against itself.
const THRESHOLDS: ReplayThresholds = {
  minVerdictAgreementRate: 0.99,
  maxConfidenceDeltaP95: 5,
  minControllerActionAgreementRate: 0.99,
  maxExecutionFailures: 0,
  maxSchemaValidationFailures: 0,
};

async function main() {
  const allFixtureFiles = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const sampleFiles = allFixtureFiles.slice(0, SAMPLE_SIZE);
  const fixtures: EvalFixture[] = sampleFiles.map(
    (f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf-8")) as EvalFixture,
  );

  console.log(`Gate 2a Noise Baseline -- Old Runtime A vs Old Runtime B, ${fixtures.length} of ${allFixtureFiles.length} real fixtures, real Claude calls, no new engine involved.`);
  console.log(`Fixtures: ${sampleFiles.join(", ")}\n`);

  const identityA: ExecutionIdentity = { teamId: "replay-baseline-a", userId: "replay-baseline-a", prospectId: "replay-baseline", prospectName: "Replay Baseline Fixture" };
  const identityB: ExecutionIdentity = { teamId: "replay-baseline-b", userId: "replay-baseline-b", prospectId: "replay-baseline", prospectName: "Replay Baseline Fixture" };
  const perFixtureResults: ReplayFixtureResult[] = [];

  for (const fixture of fixtures) {
    console.log(`  ${fixture.name} ...`);

    let runA;
    try {
      runA = normalizeOldResult(await runAgentDebateWithController(fixture.input, identityA));
    } catch (err) {
      runA = errorOutcome(err);
    }

    let runB;
    try {
      runB = normalizeOldResult(await runAgentDebateWithController(fixture.input, identityB));
    } catch (err) {
      runB = errorOutcome(err);
    }

    const result = compareResults(fixture.name, runA, runB, CONFIDENCE_DELTA_FLAG_THRESHOLD);
    perFixtureResults.push(result);
    console.log(`    verdict: ${result.verdictAgreement ? "agree" : "DISAGREE"} (A=${result.oldVerdict} vs B=${result.newVerdict}), categories: [${result.disagreementCategories.join(", ") || "none"}]`);
    if (result.error) console.log(`    error: ${result.error}`);
  }

  const metadata: ReplayMetadata = {
    replayId: randomUUID(),
    codebaseCommit: null,
    fixtureSetHash: computeFixtureSetHash(allFixtureFiles),
    fixtureCount: fixtures.length,
    model: CLAUDE_MODEL,
    promptsCommit: null,
    decisionPackVersion: SALES_LEAD_QUALIFICATION_PACK.version,
    controllerPolicyVersion: DEFAULT_CONTROLLER_POLICY.version,
    runAt: new Date().toISOString(),
    actualCostUsd: perFixtureResults.reduce((s, r) => s + r.oldCostUsd + r.newCostUsd, 0),
  };

  const report = aggregateReport(metadata, THRESHOLDS, perFixtureResults);

  mkdirSync(RUNS_DIR, { recursive: true });
  const outPath = join(RUNS_DIR, `replay_noise_baseline_${report.metadata.replayId}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`\nActual cost: $${report.metadata.actualCostUsd.toFixed(4)} for ${fixtures.length} fixtures (old runtime x2)`);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
