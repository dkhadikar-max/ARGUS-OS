/**
 * v4 roadmap Phase 9 -- runs all fixtures through one of the 3 benchmark
 * candidates and writes an extended CandidateRunManifest. Same cost
 * warning as eval/run.ts: this makes real Claude API calls.
 *
 * Usage: npx tsx eval/run-candidate.ts --candidate=pipeline|single-call|pipeline-with-conflict [--limit=N]
 */
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreToVerdict } from "@argus/shared";
import { runAgentDebate, type DecisionAgentInput } from "../src/agents/orchestrator.js";
import { CLAUDE_MODEL } from "../src/agents/claude-client.js";
import { runAgentDebateSingleCall } from "../src/agents/benchmark/single-call-orchestrator.js";
import { runAgentDebatePipelineWithConflict } from "../src/agents/benchmark/pipeline-with-conflict-orchestrator.js";
import {
  computeConfidenceCalibrationFlag,
  computeDecisionValuePerDollar,
  computeEvidenceUtilization,
  computeInferenceCost,
} from "./metrics.js";
import type { BenchmarkCandidate, CandidateRunManifest, CandidateRunResult, EvalFixture } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");
const RUNS_DIR = join(__dirname, "runs");

function parseArgs(): { candidate: BenchmarkCandidate; limit: number | null; fixtures: string[] | null } {
  const candidateArg = process.argv.find((a) => a.startsWith("--candidate="))?.split("=")[1];
  const limitArg = process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const fixtureArg = process.argv.find((a) => a.startsWith("--fixture="))?.split("=")[1];
  if (candidateArg !== "pipeline" && candidateArg !== "single-call" && candidateArg !== "pipeline-with-conflict") {
    throw new Error("Usage: --candidate=pipeline|single-call|pipeline-with-conflict [--limit=N] [--fixture=name1,name2]");
  }
  return {
    candidate: candidateArg,
    limit: limitArg ? Number(limitArg) : null,
    fixtures: fixtureArg ? fixtureArg.split(",") : null,
  };
}

function loadFixtures(limit: number | null, fixtureNames: string[] | null): EvalFixture[] {
  const all = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort() // deterministic order, so --limit=10 is the same 10 every run
    .map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf-8")) as EvalFixture);
  // --fixture targets exact fixtures by name (e.g. re-testing just the ones
  // that failed in a prior run, without re-spending on ones that already
  // succeeded) -- takes precedence over --limit, which only ever meant
  // "the first N in sorted order".
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

async function runOneFixture(candidate: BenchmarkCandidate, fixture: EvalFixture): Promise<CandidateRunResult> {
  try {
    const debate =
      candidate === "pipeline"
        ? await runAgentDebate(fixture.input)
        : candidate === "single-call"
          ? await runAgentDebateSingleCall(fixture.input)
          : await runAgentDebatePipelineWithConflict(fixture.input);
    const conflict = candidate === "pipeline-with-conflict" ? (debate as Awaited<ReturnType<typeof runAgentDebatePipelineWithConflict>>).conflict : null;

    const verdict = scoreToVerdict(debate.output.judge.weighted_score);
    const inferenceCostUsd = computeInferenceCost(debate.usage);
    const { decisionValueUsd, valueCostRatio } = computeDecisionValuePerDollar(verdict, inferenceCostUsd);
    const evidenceUtilization = computeEvidenceUtilization(fixture.input as DecisionAgentInput, debate.output);
    const calibration = computeConfidenceCalibrationFlag(debate.output);

    return {
      fixture: fixture.name,
      candidate,
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
      conflict,
      error: null,
    };
  } catch (err) {
    return {
      fixture: fixture.name,
      candidate,
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
      conflict: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const { candidate, limit, fixtures: fixtureNames } = parseArgs();
  const fixtures = loadFixtures(limit, fixtureNames);
  console.log(`Running ${fixtures.length} fixture(s) against candidate "${candidate}" (${CLAUDE_MODEL})...\n`);

  const results: CandidateRunResult[] = [];
  for (const fixture of fixtures) {
    process.stdout.write(`  ${fixture.name} ... `);
    const result = await runOneFixture(candidate, fixture);
    results.push(result);
    console.log(
      result.error
        ? `ERROR (${result.error})`
        : `${result.verdict} (score ${result.weightedScore}, ${result.processingTimeMs}ms, $${result.inferenceCostUsd.toFixed(4)})`,
    );
  }

  const runId = `${candidate}_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const manifest: CandidateRunManifest = {
    runId,
    createdAt: new Date().toISOString(),
    candidate,
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
