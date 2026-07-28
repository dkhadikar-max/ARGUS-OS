/**
 * Gate 2 Replay VALIDATION SAMPLE -- not the real Replay run.
 *
 * Purpose: validate the real pipeline end-to-end (both runtimes, real
 * Claude calls, real comparison/aggregation logic) against a small, cheap
 * slice of fixtures before committing to the full ~$10-15 / 51-fixture
 * run described in GATE2_REPLAY_AUTHORIZATION.md. Explicitly authorized
 * by the user as a smaller, separate spend from the full Replay.
 *
 * Reuses run-replay.ts's real, already-unit-tested pure functions
 * (normalizeOldResult/normalizeNewResult/errorOutcome/compareResults/
 * aggregateReport/computeFixtureSetHash) unchanged -- this script adds
 * no new comparison or methodology logic of its own, and does not modify
 * the frozen run-replay.ts. It only narrows *which* fixtures run.
 *
 * Usage: npx tsx eval/run-replay-sample.ts
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentDebateWithController } from "../src/agents/execution-runtime.js";
import { evaluate } from "../src/agents/decision-engine.js";
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
} from "./run-replay.js";
import type { EvalFixture, ReplayMetadata, ReplayFixtureResult, ReplayThresholds } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");
const RUNS_DIR = join(__dirname, "runs");
const SAMPLE_SIZE = 5;
const CONFIDENCE_DELTA_FLAG_THRESHOLD = 5; // same value run-replay.ts uses -- not a new threshold

// Same proposed thresholds run-replay.ts uses, only so the sample report's
// `passed` field is computed the same way -- not a pass/fail gate on Gate 2
// itself (a 5-fixture sample can't demonstrate a 99% rate either way).
const SAMPLE_THRESHOLDS: ReplayThresholds = {
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

  console.log(`Gate 2 Replay VALIDATION SAMPLE -- ${fixtures.length} of ${allFixtureFiles.length} real fixtures, both runtimes, real Claude calls.`);
  console.log(`Fixtures: ${sampleFiles.join(", ")}\n`);

  const identity: ExecutionIdentity = { teamId: "replay-sample", userId: "replay-sample", prospectId: "replay-sample", prospectName: "Replay Sample Fixture" };
  const perFixtureResults: ReplayFixtureResult[] = [];

  for (const fixture of fixtures) {
    console.log(`  ${fixture.name} ...`);

    let oldNorm;
    try {
      oldNorm = normalizeOldResult(await runAgentDebateWithController(fixture.input, identity));
    } catch (err) {
      oldNorm = errorOutcome(err);
    }

    let newNorm;
    try {
      newNorm = normalizeNewResult(await evaluate(SALES_LEAD_QUALIFICATION_PACK, fixture.input, identity));
    } catch (err) {
      newNorm = errorOutcome(err);
    }

    const result = compareResults(fixture.name, oldNorm, newNorm, CONFIDENCE_DELTA_FLAG_THRESHOLD);
    perFixtureResults.push(result);
    console.log(`    verdict: ${result.verdictAgreement ? "agree" : "DISAGREE"} (${result.oldVerdict} vs ${result.newVerdict}), categories: [${result.disagreementCategories.join(", ") || "none"}]`);
    if (result.error) console.log(`    error: ${result.error}`);
  }

  const metadata: ReplayMetadata = {
    replayId: randomUUID(),
    codebaseCommit: null,
    fixtureSetHash: computeFixtureSetHash(allFixtureFiles), // hash of the FULL frozen set, for provenance -- this run only exercises a slice of it
    fixtureCount: fixtures.length,
    model: CLAUDE_MODEL,
    promptsCommit: null,
    decisionPackVersion: SALES_LEAD_QUALIFICATION_PACK.version,
    controllerPolicyVersion: DEFAULT_CONTROLLER_POLICY.version,
    runAt: new Date().toISOString(),
    actualCostUsd: perFixtureResults.reduce((s, r) => s + r.oldCostUsd + r.newCostUsd, 0),
  };

  const report = aggregateReport(metadata, SAMPLE_THRESHOLDS, perFixtureResults);

  mkdirSync(RUNS_DIR, { recursive: true });
  const outPath = join(RUNS_DIR, `replay_sample_${report.metadata.replayId}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`\nActual cost: $${report.metadata.actualCostUsd.toFixed(4)} for ${fixtures.length} fixtures (both runtimes)`);
  console.log(`Implied full-51-fixture cost: ~$${((report.metadata.actualCostUsd / fixtures.length) * 51).toFixed(2)}`);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
