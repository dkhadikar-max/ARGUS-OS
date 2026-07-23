/**
 * Evaluation harness runner (v4 roadmap Phase 0).
 *
 * Calls the REAL Anthropic API against a fixed set of fixtures and records
 * verdict/score/latency for each, so a later code change (LLMProvider
 * extraction, Retriever Registry wiring, the eventual single-call-vs-multi-
 * call benchmark) can be compared against a known-good baseline via
 * compare.ts. Deliberately calls runAgentDebate() directly rather than going
 * through decision.service.ts's createDecision() -- no DB, no Redis, no
 * cache, no enrichment, no Policy Engine, so this exercises only the agent
 * pipeline itself and nothing else can shift the numbers between runs.
 *
 * COST WARNING: every run makes 5 real Claude API calls per fixture (25
 * calls for the current 5 fixtures). Run manually -- this is intentionally
 * NOT wired into `npm test` or CI (see vitest.config.ts's include glob,
 * which only picks up src/**\/*.test.ts; this file lives outside src/ for
 * exactly that reason, same as packages/database/prisma/seed.ts).
 *
 * Usage: npm run eval:run --workspace=@argus/api
 */
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreToVerdict } from "@argus/shared";
import { runAgentDebate } from "../src/agents/orchestrator.js";
import { CLAUDE_MODEL } from "../src/agents/claude-client.js";
import type { EvalFixture, EvalRunManifest, EvalRunResult } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");
const RUNS_DIR = join(__dirname, "runs");

function loadFixtures(): EvalFixture[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf-8")) as EvalFixture);
}

function currentGitCommit(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim();
  } catch {
    return null;
  }
}

async function runFixture(fixture: EvalFixture): Promise<EvalRunResult> {
  try {
    const { output, processingTimeMs } = await runAgentDebate(fixture.input);
    // Mirrors decision.service.ts's own drift correction: derive the verdict
    // from weighted_score rather than trusting the Judge's own label, so the
    // harness measures the same production-facing verdict a real decision
    // would get, not a number that could disagree with it.
    const verdict = scoreToVerdict(output.judge.weighted_score);
    return {
      fixture: fixture.name,
      verdict,
      weightedScore: output.judge.weighted_score,
      confidence: output.judge.confidence,
      agentConsensus: output.judge.agent_consensus,
      recommendedAction: output.judge.recommended_action,
      processingTimeMs,
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
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const fixtures = loadFixtures();
  console.log(`Running ${fixtures.length} fixture(s) against ${CLAUDE_MODEL}...\n`);

  const results: EvalRunResult[] = [];
  for (const fixture of fixtures) {
    process.stdout.write(`  ${fixture.name} ... `);
    const result = await runFixture(fixture);
    results.push(result);
    console.log(
      result.error
        ? `ERROR (${result.error})`
        : `${result.verdict} (score ${result.weightedScore}, ${result.processingTimeMs}ms)`,
    );
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const manifest: EvalRunManifest = {
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
