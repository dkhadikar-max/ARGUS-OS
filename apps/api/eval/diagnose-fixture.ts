/**
 * Single-fixture diagnostic rerun -- captures the FULL structured result
 * from both pipelines (not the normalized summary run-replay.ts compares
 * on), so a specific unexplained disagreement can be classified at the
 * earliest stage where the two pipelines actually diverge:
 *
 *   CapabilityOutputsByStage -> DecisionState -> ControllerDecision -> SynthesizerResult
 *
 * (Planner/ExecutionPlan is not included -- plan() is a pure function of
 * the pack's fixed KNOWN_STAGE_DEPENDENCIES, already proven identical to
 * the old runtime's hardcoded order in planner.test.ts; there is nothing
 * fixture-dependent to capture there.)
 *
 * Neither ExecutionRuntimeResult nor DecisionEngineResult expose a raw
 * CapabilityOutputsByStage in their public return type (by design -- see
 * decision-engine.ts's own comment on why `graph`/`controllerDecision`
 * stay separate from the PII-safe `executionTrace`). This script does not
 * modify either function to expose one. Instead it captures what both
 * results already do expose and that is sufficient for classification:
 * `output.{research,icp,intent,risk}` (each stage's real content AND its
 * own `.confidence` field -- functionally the capability output, just not
 * wrapped in the CapabilityOutput envelope), `executionTrace.{timings,costs}`
 * (real per-stage latency/cost), `graph` (the real DecisionState history),
 * `controllerDecision`, and `output.judge` (the real SynthesizerResult).
 *
 * Scoped, targeted spend (one fixture, both pipelines, ~$0.20) -- not a
 * rerun of the sample or the full Replay.
 *
 * Usage: npx tsx eval/diagnose-fixture.ts <fixture-name>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentDebateWithController } from "../src/agents/execution-runtime.js";
import { evaluate } from "../src/agents/decision-engine.js";
import { SALES_LEAD_QUALIFICATION_PACK } from "../src/agents/decision-pack.js";
import type { ExecutionIdentity } from "../src/agents/reasoning-capability.js";
import type { EvalFixture } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");
const RUNS_DIR = join(__dirname, "runs");

async function main() {
  const fixtureName = process.argv[2] ?? "conflicting-signals-hiring-freeze";
  const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, `${fixtureName}.json`), "utf-8")) as EvalFixture;

  console.log(`Diagnostic rerun -- "${fixtureName}", both pipelines, real Claude calls.\n`);

  const identity: ExecutionIdentity = { teamId: "diagnostic", userId: "diagnostic", prospectId: "diagnostic", prospectName: "Diagnostic Fixture" };

  console.log("Running OLD runtime (runAgentDebateWithController)...");
  const oldResult = await runAgentDebateWithController(fixture.input, identity);

  console.log("Running NEW engine (evaluate)...");
  const newResult = await evaluate(SALES_LEAD_QUALIFICATION_PACK, fixture.input, identity);

  mkdirSync(RUNS_DIR, { recursive: true });
  const outPath = join(RUNS_DIR, `diagnostic_${fixtureName}_${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify({ fixtureName, old: oldResult, new: newResult }, null, 2));

  console.log(`\nWrote full structured artifacts to ${outPath}`);
  console.log(`Old verdict: ${oldResult.output.judge.verdict} (confidence ${oldResult.output.judge.confidence})`);
  console.log(`New verdict: ${newResult.output.judge.verdict} (confidence ${newResult.output.judge.confidence})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
