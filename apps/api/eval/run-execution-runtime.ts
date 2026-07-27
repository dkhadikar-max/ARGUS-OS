/**
 * Execution Runtime v1 (docs/ARCHITECTURE_V4.md) -- runs all fixtures
 * through runAgentDebateWithController (execution-runtime.ts) instead of
 * the legacy runAgentDebate, and writes an ExecutionRuntimeRunManifest.
 * Compare against an existing "pipeline" CandidateRunManifest (produced by
 * `npm run eval:run-candidate -- --candidate=pipeline`, same fixture set)
 * via eval/compare-execution-runtime.ts.
 *
 * COST WARNING: same as every other eval/run*.ts script -- this makes real
 * Claude API calls (5 per fixture, or 6 for a fixture where the Controller
 * genuinely invokes an extra capability).
 *
 * Usage: npm run eval:run-execution-runtime --workspace=@argus/api [-- --limit=N] [-- --fixture=name1,name2]
 */
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError, scoreToVerdict } from "@argus/shared";
import { runAgentDebateWithController } from "../src/agents/execution-runtime.js";
import { CLAUDE_MODEL } from "../src/agents/claude-client.js";
import { computeConfidenceCalibrationFlag, computeDecisionValuePerDollar, computeEvidenceUtilization, computeInferenceCost } from "./metrics.js";
import type { EvalFixture, ExecutionRuntimeRunManifest, ExecutionRuntimeRunResult } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");
const RUNS_DIR = join(__dirname, "runs");

// The eval harness has no real team/prospect/decision identity to give
// runAgentDebateWithController -- fixtures are synthetic, standalone
// DecisionAgentInput objects (same as every other eval/run*.ts script,
// which all call runAgentDebate(fixture.input) directly, no decision.
// service.ts involved). Fixed, clearly-synthetic identity values, not a
// claim about any real team/prospect.
const EVAL_IDENTITY = { teamId: "eval", userId: "eval", prospectId: "eval", prospectName: "Eval Fixture" };

function parseArgs(): { limit: number | null; fixtures: string[] | null } {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const fixtureArg = process.argv.find((a) => a.startsWith("--fixture="))?.split("=")[1];
  return { limit: limitArg ? Number(limitArg) : null, fixtures: fixtureArg ? fixtureArg.split(",") : null };
}

function loadFixtures(limit: number | null, fixtureNames: string[] | null): EvalFixture[] {
  const all = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort() // deterministic order, so --limit=10 is the same 10 every run
    .map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf-8")) as EvalFixture);
  if (fixtureNames) return all.filter((f) => fixtureNames.includes(f.name));
  return limit ? all.slice(0, limit) : all;
}

function currentGitCommit(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim();
  } catch {
    return null;
  }
}

async function runOneFixture(fixture: EvalFixture): Promise<ExecutionRuntimeRunResult> {
  try {
    const debate = await runAgentDebateWithController(fixture.input, EVAL_IDENTITY);

    const verdict = scoreToVerdict(debate.output.judge.weighted_score);
    const inferenceCostUsd = computeInferenceCost(debate.usage);
    const { decisionValueUsd, valueCostRatio } = computeDecisionValuePerDollar(verdict, inferenceCostUsd);
    const evidenceUtilization = computeEvidenceUtilization(fixture.input, debate.output);
    const calibration = computeConfidenceCalibrationFlag(debate.output);
    const { graph, controllerDecision } = debate.executionTrace;

    return {
      fixture: fixture.name,
      verdict,
      weightedScore: debate.output.judge.weighted_score,
      confidence: debate.output.judge.confidence,
      agentConsensus: debate.output.judge.agent_consensus,
      recommendedAction: debate.output.judge.recommended_action,
      processingTimeMs: debate.processingTimeMs,
      inputTokens: debate.usage.inputTokens,
      outputTokens: debate.usage.outputTokens,
      inferenceCostUsd,
      decisionValueUsd,
      valueCostRatio,
      evidenceUtilizationRate: evidenceUtilization.utilizationRate,
      confidenceCalibration: calibration,
      controllerAction: controllerDecision.action,
      controllerTargetCapability: controllerDecision.targetCapability ?? null,
      controllerReasons: controllerDecision.reasons,
      graphVersionCount: graph.states.size,
      extraCapabilityInvocations: graph.states.size - 1,
      error: null,
    };
  } catch (err) {
    return {
      fixture: fixture.name,
      verdict: "ERROR",
      weightedScore: -1,
      confidence: -1,
      agentConsensus: "error",
      recommendedAction: "error",
      processingTimeMs: -1,
      inputTokens: 0,
      outputTokens: 0,
      inferenceCostUsd: 0,
      decisionValueUsd: 0,
      valueCostRatio: null,
      evidenceUtilizationRate: null,
      confidenceCalibration: { consideredSparse: false, judgeConfidence: -1, ruleHeld: false },
      controllerAction: "error",
      controllerTargetCapability: null,
      controllerReasons: [],
      graphVersionCount: 0,
      extraCapabilityInvocations: 0,
      // Same cause-preserving treatment run-candidate.ts already uses --
      // callAgent's own AppError.message is a generic constant; the real
      // diagnosable text lives in extra.cause.
      error:
        (err instanceof Error ? err.message : String(err)) +
        (err instanceof AppError && err.extra?.cause !== undefined ? ` (cause: ${String(err.extra.cause)})` : ""),
    };
  }
}

async function main() {
  const { limit, fixtures: fixtureNames } = parseArgs();
  const fixtures = loadFixtures(limit, fixtureNames);
  console.log(`Running ${fixtures.length} fixture(s) through Execution Runtime v1 (${CLAUDE_MODEL})...\n`);

  const results: ExecutionRuntimeRunResult[] = [];
  for (const fixture of fixtures) {
    process.stdout.write(`  ${fixture.name} ... `);
    const result = await runOneFixture(fixture);
    results.push(result);
    console.log(
      result.error
        ? `ERROR (${result.error})`
        : `${result.verdict} (score ${result.weightedScore}, controller=${result.controllerAction}` +
            `${result.controllerTargetCapability ? `->${result.controllerTargetCapability}` : ""}, ` +
            `${result.processingTimeMs}ms, $${result.inferenceCostUsd.toFixed(4)})`,
    );
  }

  const runId = `execution-runtime_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const manifest: ExecutionRuntimeRunManifest = {
    runId,
    createdAt: new Date().toISOString(),
    model: CLAUDE_MODEL,
    gitCommit: currentGitCommit(),
    results,
  };

  mkdirSync(RUNS_DIR, { recursive: true });
  const outPath = join(RUNS_DIR, `${runId}.json`);
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
