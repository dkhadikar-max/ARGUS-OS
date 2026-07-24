/**
 * v4 roadmap Phase 14 (docs/ARCHITECTURE_V4.md, "Dynamic Model Routing"
 * benchmark) -- runs N fixtures with exactly one agent stage routed to a
 * cheaper model (Haiku by default), the rest left on the default model.
 * Compare the resulting manifest against an existing "pipeline"
 * CandidateRunManifest (Phase 9) using eval/compare-model-routing.ts --
 * matched by fixture name, so the two runs don't need identical fixture
 * sets, counts, or ordering.
 *
 * Same cost warning as every other eval/run*.ts script: this makes real
 * Claude API calls.
 *
 * Usage: npx tsx eval/run-model-routing.ts --agent=research|icp|intent|risk [--model=haiku] [--limit=N]
 */
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreToVerdict } from "@argus/shared";
import { runAgentDebateWithModelRouting, HAIKU_MODEL } from "../src/agents/benchmark/model-routing-orchestrator.js";
import { CLAUDE_MODEL } from "../src/agents/claude-client.js";
import { computeInferenceCost } from "./metrics.js";
import type { EvalFixture, ModelRoutingRunManifest, ModelRoutingRunResult } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");
const RUNS_DIR = join(__dirname, "runs");

type AgentName = "research" | "icp" | "intent" | "risk";

function parseArgs(): { agent: AgentName; model: string; limit: number | null } {
  const agentArg = process.argv.find((a) => a.startsWith("--agent="))?.split("=")[1];
  const modelArg = process.argv.find((a) => a.startsWith("--model="))?.split("=")[1];
  const limitArg = process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1];
  if (agentArg !== "research" && agentArg !== "icp" && agentArg !== "intent" && agentArg !== "risk") {
    throw new Error("Usage: --agent=research|icp|intent|risk [--model=haiku] [--limit=N]");
  }
  const model = !modelArg || modelArg === "haiku" ? HAIKU_MODEL : modelArg;
  return { agent: agentArg, model, limit: limitArg ? Number(limitArg) : null };
}

function loadFixtures(limit: number | null): EvalFixture[] {
  const all = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort() // deterministic order, so --limit=10 is the same 10 every run
    .map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf-8")) as EvalFixture);
  return limit ? all.slice(0, limit) : all;
}

function currentGitCommit(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim();
  } catch {
    return null;
  }
}

async function runOneFixture(agent: AgentName, model: string, fixture: EvalFixture): Promise<ModelRoutingRunResult> {
  const overrides: Record<string, string> = { [agent]: model };
  try {
    const debate = await runAgentDebateWithModelRouting(fixture.input, overrides);
    return {
      fixture: fixture.name,
      agentOverrides: overrides,
      verdict: scoreToVerdict(debate.output.judge.weighted_score),
      weightedScore: debate.output.judge.weighted_score,
      confidence: debate.output.judge.confidence,
      agentConsensus: debate.output.judge.agent_consensus,
      recommendedAction: debate.output.judge.recommended_action,
      processingTimeMs: debate.processingTimeMs,
      inputTokens: debate.usage.inputTokens,
      outputTokens: debate.usage.outputTokens,
      inferenceCostUsd: computeInferenceCost(debate.usage),
      error: null,
    };
  } catch (err) {
    return {
      fixture: fixture.name,
      agentOverrides: overrides,
      verdict: "ERROR",
      weightedScore: -1,
      confidence: -1,
      agentConsensus: "error",
      recommendedAction: "error",
      processingTimeMs: -1,
      inputTokens: 0,
      outputTokens: 0,
      inferenceCostUsd: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const { agent, model, limit } = parseArgs();
  const fixtures = loadFixtures(limit);
  console.log(`Running ${fixtures.length} fixture(s) with "${agent}" routed to "${model}" (rest on ${CLAUDE_MODEL})...\n`);

  const results: ModelRoutingRunResult[] = [];
  for (const fixture of fixtures) {
    process.stdout.write(`  ${fixture.name} ... `);
    const result = await runOneFixture(agent, model, fixture);
    results.push(result);
    console.log(
      result.error
        ? `ERROR (${result.error})`
        : `${result.verdict} (score ${result.weightedScore}, ${result.processingTimeMs}ms, $${result.inferenceCostUsd.toFixed(4)})`,
    );
  }

  const runId = `model-routing_${agent}-${model}_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const manifest: ModelRoutingRunManifest = {
    runId,
    createdAt: new Date().toISOString(),
    agentOverrides: { [agent]: model },
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
