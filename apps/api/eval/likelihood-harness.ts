/**
 * Zero-cost local validation harness (Action B, adapted from the user's own
 * "Option 2: Zero-Cost Path" plan). Runs Research/ICP/Intent/Risk (NOT
 * Judge -- Judge synthesizes across all four already-validated stage
 * outputs and drafts outbound messages; there is no way to grade a drafted
 * message locally without a human or Claude in the loop) against a fully
 * local Ollama model, using the real dependency chain (Research -> ICP+
 * Intent -> Risk, same order as runStagesResearchThroughRisk) so ICP/
 * Intent/Risk see a real prior-stage output, not a blank placeholder.
 *
 * Records only what a local-only run can actually measure: does each
 * stage's raw output pass its real Zod schema (researchAgentOutputSchema
 * etc, imported from @argus/shared -- not a reimplementation), latency, and
 * token counts. Deliberately does NOT compute or claim any Ollama-vs-Claude
 * comparison: checked the existing eval/runs/*.json manifests before
 * writing this file and confirmed no per-stage Claude output is cached
 * anywhere (only judge-level aggregates), so there is nothing to compare
 * against yet. Every result is labeled LOCAL_ONLY_LABEL; the real
 * comparison is queued for whenever live Claude spend is separately
 * authorized (Bible's own "When API Credits Are Exhausted" protocol), not
 * fabricated here.
 *
 * Zero API cost (no Anthropic calls), but NOT zero wall-clock cost: this
 * machine's real, observed generation speed is ~4 tokens/sec on CPU
 * (llama3.2:3b smoke test, 2026-07-27), so a full run across every fixture
 * can take hours, not minutes -- use --limit for a pilot first.
 *
 * Usage: npx tsx eval/likelihood-harness.ts [--model=llama3.2:3b] [--limit=N] [--stage=research|icp|intent|risk]
 *   --stage restricts which stage(s) are RECORDED in the output manifest,
 *   but the real chain up to and including that stage still runs (e.g.
 *   --stage=risk still runs research/icp/intent first, for real, so risk
 *   gets a real prior-stage input) -- except --stage=research itself,
 *   which has no dependencies and is the cheapest possible pilot.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  researchAgentOutputSchema,
  icpAgentOutputSchema,
  intentAgentOutputSchema,
  riskAgentOutputSchema,
  type ResearchAgentOutput,
  type IcpAgentOutput,
  type IntentAgentOutput,
} from "@argus/shared";
import type { ZodType } from "zod";
import { RESEARCH_AGENT_PROMPT, ICP_AGENT_PROMPT, INTENT_AGENT_PROMPT, RISK_AGENT_PROMPT } from "../src/agents/prompts.js";
import {
  callAgent,
  fillPlaceholders,
  systemPromptFor,
  RESEARCH_TOOL,
  ICP_TOOL,
  INTENT_TOOL,
  RISK_TOOL,
  type DecisionAgentInput,
  type StageOutputs,
} from "../src/agents/orchestrator.js";
import type { ToolSchema } from "../src/agents/providers/types.js";
import { OllamaProvider } from "../src/agents/providers/ollama-provider.js";
import type { EvalFixture } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");
const RUNS_DIR = join(__dirname, "runs");

const DEFAULT_OLLAMA_MODEL = "llama3.2:3b";
const LOCAL_ONLY_LABEL = "LOCAL ONLY -- PENDING CLAUDE VALIDATION";

type StageId = "research" | "icp" | "intent" | "risk";
const ALL_STAGES: StageId[] = ["research", "icp", "intent", "risk"];

interface StageAttemptResult {
  fixture: string;
  stage: StageId;
  ollamaModel: string;
  schemaValid: boolean;
  /** The real underlying failure reason (AppError.extra.cause, set by
   *  callAgent) when schemaValid is false -- could be a Zod validation
   *  message, a fetch/timeout error, or an HTTP error from Ollama itself;
   *  this is not classified further, the raw message is left for a human
   *  to read. */
  failureReason: string | null;
  processingTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  label: typeof LOCAL_ONLY_LABEL;
}

interface LikelihoodHarnessManifest {
  runId: string;
  createdAt: string;
  ollamaModel: string;
  gitCommit: string | null;
  fixtureCount: number;
  results: StageAttemptResult[];
  note: string;
}

function parseArgs(): { model: string; limit: number | null; stage: StageId | null } {
  const modelArg = process.argv.find((a) => a.startsWith("--model="))?.split("=")[1];
  const limitArg = process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const stageArg = process.argv.find((a) => a.startsWith("--stage="))?.split("=")[1];
  if (stageArg && !ALL_STAGES.includes(stageArg as StageId)) {
    throw new Error("Usage: [--model=llama3.2:3b] [--limit=N] [--stage=research|icp|intent|risk]");
  }
  return {
    model: modelArg ?? DEFAULT_OLLAMA_MODEL,
    limit: limitArg ? Number(limitArg) : null,
    stage: (stageArg as StageId | undefined) ?? null,
  };
}

function loadFixtures(limit: number | null): EvalFixture[] {
  const all = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort() // deterministic order, so --limit=N is the same N fixtures every run
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

/** Runs one stage against Ollama via the real callAgent (same retry/
 *  validation logic every production stage call goes through), records a
 *  StageAttemptResult either way, and returns the parsed output on success
 *  or null on failure so the caller can decide whether downstream stages
 *  in the chain can still run for real. */
async function runStage<T>(
  fixtureName: string,
  stage: StageId,
  system: string,
  userPrompt: string,
  tool: ToolSchema,
  schema: ZodType<T>,
  maxTokens: number,
  model: string,
  provider: OllamaProvider,
  results: StageAttemptResult[],
): Promise<T | null> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const startedAt = Date.now();
  try {
    const output = await callAgent(system, userPrompt, tool, schema, maxTokens, usage, model, provider);
    results.push({
      fixture: fixtureName,
      stage,
      ollamaModel: model,
      schemaValid: true,
      failureReason: null,
      processingTimeMs: Date.now() - startedAt,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      label: LOCAL_ONLY_LABEL,
    });
    return output;
  } catch (err) {
    const failureReason =
      err instanceof Error && "extra" in err
        ? String((err as Error & { extra?: { cause?: unknown } }).extra?.cause ?? err.message)
        : err instanceof Error
          ? err.message
          : String(err);
    results.push({
      fixture: fixtureName,
      stage,
      ollamaModel: model,
      schemaValid: false,
      failureReason,
      processingTimeMs: Date.now() - startedAt,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      label: LOCAL_ONLY_LABEL,
    });
    return null;
  }
}

/** Runs the real Research -> ICP+Intent -> Risk chain for one fixture
 *  against Ollama, stopping the chain (not the whole harness) wherever a
 *  stage fails, since a downstream stage has no real prior-stage output to
 *  work from once its dependency has failed. */
async function runFixture(
  fixture: EvalFixture,
  model: string,
  onlyStage: StageId | null,
  provider: OllamaProvider,
): Promise<StageAttemptResult[]> {
  const results: StageAttemptResult[] = [];
  const input: DecisionAgentInput = fixture.input;

  const needsStage = (s: StageId) => onlyStage === null || onlyStage === s || stageDependsOn(onlyStage, s);

  const research: ResearchAgentOutput | null = needsStage("research")
    ? await runStage(
        fixture.name,
        "research",
        systemPromptFor("research", input.companyContext),
        fillPlaceholders(RESEARCH_AGENT_PROMPT, input, {}),
        RESEARCH_TOOL,
        researchAgentOutputSchema,
        2048,
        model,
        provider,
        results,
      )
    : null;

  if (research === null) return results; // every downstream stage depends on research

  const priorAfterResearch: StageOutputs = { research };

  const [icp, intent]: [IcpAgentOutput | null, IntentAgentOutput | null] = await Promise.all([
    needsStage("icp")
      ? runStage(
          fixture.name,
          "icp",
          systemPromptFor("icp", input.companyContext),
          fillPlaceholders(ICP_AGENT_PROMPT, input, priorAfterResearch),
          ICP_TOOL,
          icpAgentOutputSchema,
          1536,
          model,
          provider,
          results,
        )
      : Promise.resolve(null),
    needsStage("intent")
      ? runStage(
          fixture.name,
          "intent",
          systemPromptFor("intent", input.companyContext),
          fillPlaceholders(INTENT_AGENT_PROMPT, input, priorAfterResearch),
          INTENT_TOOL,
          intentAgentOutputSchema,
          1536,
          model,
          provider,
          results,
        )
      : Promise.resolve(null),
  ]);

  if (!needsStage("risk")) return results;
  if (icp === null || intent === null) return results; // risk depends on both

  await runStage(
    fixture.name,
    "risk",
    systemPromptFor("risk", input.companyContext),
    fillPlaceholders(RISK_AGENT_PROMPT, input, { research, icp, intent }),
    RISK_TOOL,
    riskAgentOutputSchema,
    2560,
    model,
    provider,
    results,
  );

  return results;
}

/** research is a dependency of icp/intent/risk; icp and intent are each a
 *  dependency of risk. Used so --stage=risk still runs the real upstream
 *  chain instead of skipping straight to risk with nothing to inject. */
function stageDependsOn(target: StageId, candidate: StageId): boolean {
  if (target === "risk") return candidate === "research" || candidate === "icp" || candidate === "intent";
  if (target === "icp" || target === "intent") return candidate === "research";
  return false;
}

async function main() {
  const { model, limit, stage } = parseArgs();
  const fixtures = loadFixtures(limit);
  const provider = new OllamaProvider();

  console.log(
    `Running ${fixtures.length} fixture(s) against Ollama model "${model}" (local only, no Claude calls)` +
      (stage ? ` -- recording stage "${stage}" only\n` : " -- recording all 4 stages\n"),
  );
  console.log("This machine's observed generation speed is ~4 tokens/sec on CPU -- expect minutes per stage call.\n");

  const allResults: StageAttemptResult[] = [];
  for (const fixture of fixtures) {
    console.log(`  ${fixture.name} ...`);
    const fixtureResults = await runFixture(fixture, model, stage, provider);
    allResults.push(...fixtureResults);
    for (const r of fixtureResults) {
      console.log(
        `    ${r.stage}: ${r.schemaValid ? "VALID" : `INVALID (${r.failureReason})`} (${r.processingTimeMs}ms, ${r.inputTokens}in/${r.outputTokens}out)`,
      );
    }
  }

  const runId = `likelihood-harness_${model.replace(/[:/]/g, "-")}_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const manifest: LikelihoodHarnessManifest = {
    runId,
    createdAt: new Date().toISOString(),
    ollamaModel: model,
    gitCommit: currentGitCommit(),
    fixtureCount: fixtures.length,
    results: allResults,
    note: `${LOCAL_ONLY_LABEL}. No Ollama-vs-Claude comparison is computed here -- no cached per-stage Claude output exists to compare against. Queued for whenever live Claude spend is separately authorized.`,
  };

  mkdirSync(RUNS_DIR, { recursive: true });
  const outPath = join(RUNS_DIR, `${runId}.json`);
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));

  const validCount = allResults.filter((r) => r.schemaValid).length;
  console.log(`\n${validCount}/${allResults.length} stage calls produced schema-valid output.`);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
