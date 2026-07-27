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
 * Usage: npx tsx eval/likelihood-harness.ts [--model=llama3.2:3b] [--limit=N] [--stage=research|icp|intent|risk] [--repair]
 *   --stage restricts which stage(s) are RECORDED in the output manifest,
 *   but the real chain up to and including that stage still runs (e.g.
 *   --stage=risk still runs research/icp/intent first, for real, so risk
 *   gets a real prior-stage input) -- except --stage=research itself,
 *   which has no dependencies and is the cheapest possible pilot.
 *
 *   --repair answers a different question than the default (raw) mode. A
 *   2-fixture raw-mode pilot (2026-07-27, llama3.2:3b) found Research
 *   failing schema validation on both fixtures, both attempts, always the
 *   same way: array-typed fields (data_points, unfair_advantages, etc)
 *   came back as JSON-stringified strings instead of real arrays. Raw mode
 *   answers "is the model's tool-call output schema-valid as-is" (what
 *   production would actually get). --repair answers "is the underlying
 *   data correct once that one known, generic mis-typing is coerced away" --
 *   it JSON.parses any tool-schema-declared array field that came back as a
 *   string, then validates the result. This is NOT silently folded into the
 *   default mode: a result recorded under --repair is a different, weaker
 *   claim (schema-valid after coercion, not schema-valid as generated) and
 *   the manifest's `mode` field and each result's `wasRepaired` flag say so
 *   explicitly.
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
  /** true only in --repair mode, and only when at least one array-typed
   *  field actually needed coercion to validate. Always false in raw mode --
   *  raw mode never mutates the model's output. */
  wasRepaired: boolean;
  /** The real underlying failure reason (AppError.extra.cause, set by
   *  callAgent, in raw mode; the last attempt's raw error in --repair mode)
   *  when schemaValid is false -- could be a Zod validation message, a
   *  fetch/timeout error, or an HTTP error from Ollama itself; this is not
   *  classified further, the raw message is left for a human to read. */
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
  mode: "raw" | "repair";
  gitCommit: string | null;
  fixtureCount: number;
  results: StageAttemptResult[];
  note: string;
}

function parseArgs(): { model: string; limit: number | null; stage: StageId | null; repair: boolean } {
  const modelArg = process.argv.find((a) => a.startsWith("--model="))?.split("=")[1];
  const limitArg = process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const stageArg = process.argv.find((a) => a.startsWith("--stage="))?.split("=")[1];
  if (stageArg && !ALL_STAGES.includes(stageArg as StageId)) {
    throw new Error("Usage: [--model=llama3.2:3b] [--limit=N] [--stage=research|icp|intent|risk] [--repair]");
  }
  return {
    model: modelArg ?? DEFAULT_OLLAMA_MODEL,
    limit: limitArg ? Number(limitArg) : null,
    stage: (stageArg as StageId | undefined) ?? null,
    repair: process.argv.includes("--repair"),
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

/** Tool-schema-declared array fields (top-level only -- the one shape the
 *  2026-07-27 pilot found llama3.2:3b mis-typing). Driven by the real
 *  ToolSchema, not a hardcoded per-stage field list, so this stays correct
 *  if RESEARCH_TOOL/ICP_TOOL/INTENT_TOOL/RISK_TOOL ever change. */
function arrayFieldNames(tool: ToolSchema): string[] {
  return Object.entries(tool.input_schema.properties)
    .filter(([, def]) => typeof def === "object" && def !== null && (def as { type?: unknown }).type === "array")
    .map(([key]) => key);
}

/** Coerces any of the given fields that came back as a JSON-stringified
 *  array (`"[\"a\",\"b\"]"`) into a real array. Leaves anything that isn't a
 *  string, or a string that isn't valid JSON, or valid JSON that isn't an
 *  array, untouched -- so schema.parse still reports the real error for
 *  shapes this doesn't understand, rather than papering over them. */
function repairArrayFields(raw: unknown, arrayFields: string[]): { repaired: unknown; changed: boolean } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { repaired: raw, changed: false };
  const repaired: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  let changed = false;
  for (const field of arrayFields) {
    const value = repaired[field];
    if (typeof value !== "string") continue;
    try {
      const parsedValue: unknown = JSON.parse(value);
      if (Array.isArray(parsedValue)) {
        repaired[field] = parsedValue;
        changed = true;
      }
    } catch {
      // not valid JSON -- leave the string as-is, schema.parse will report it
    }
  }
  return { repaired, changed };
}

const REPAIR_MAX_ATTEMPTS = 2; // mirrors callAgent's own MAX_ATTEMPTS

/** callAgent's schema.parse runs on the raw provider response with no hook
 *  to fix known-bad shapes first, and callAgent is real, shared production
 *  logic -- not something to bend for a local-model-only quirk Claude has
 *  never exhibited. This is a small, harness-only parallel to callAgent's
 *  retry loop, used only in --repair mode: same real provider.call(), but
 *  repairArrayFields runs on the raw tool input before schema.parse. */
async function callWithRepair<T>(
  system: string,
  userPrompt: string,
  tool: ToolSchema,
  schema: ZodType<T>,
  maxTokens: number,
  model: string,
  provider: OllamaProvider,
  usage: { inputTokens: number; outputTokens: number },
): Promise<{ result: T; wasRepaired: boolean }> {
  const arrayFields = arrayFieldNames(tool);
  let lastError: unknown;
  for (let attempt = 1; attempt <= REPAIR_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await provider.call({ model, maxTokens, system, userPrompt, tool });
      usage.inputTokens += response.inputTokens;
      usage.outputTokens += response.outputTokens;
      if (response.toolInput === null) {
        throw new Error(`${tool.name}: Ollama response contained no tool_use block`);
      }
      const { repaired, changed } = repairArrayFields(response.toolInput, arrayFields);
      const result = schema.parse(repaired);
      return { result, wasRepaired: changed };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Runs one stage against Ollama (via the real callAgent in raw mode, or
 *  callWithRepair in --repair mode), records a StageAttemptResult either
 *  way, and returns the parsed output on success or null on failure so the
 *  caller can decide whether downstream stages in the chain can still run
 *  for real. */
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
  repair: boolean,
  results: StageAttemptResult[],
): Promise<T | null> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const startedAt = Date.now();
  try {
    const { output, wasRepaired } = repair
      ? await callWithRepair(system, userPrompt, tool, schema, maxTokens, model, provider, usage).then((r) => ({
          output: r.result,
          wasRepaired: r.wasRepaired,
        }))
      : await callAgent(system, userPrompt, tool, schema, maxTokens, usage, model, provider).then((result) => ({
          output: result,
          wasRepaired: false,
        }));
    results.push({
      fixture: fixtureName,
      stage,
      ollamaModel: model,
      schemaValid: true,
      wasRepaired,
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
      wasRepaired: false,
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
  repair: boolean,
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
        repair,
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
          repair,
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
          repair,
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
    repair,
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
  const { model, limit, stage, repair } = parseArgs();
  const fixtures = loadFixtures(limit);
  const provider = new OllamaProvider();

  console.log(
    `Running ${fixtures.length} fixture(s) against Ollama model "${model}" (local only, no Claude calls)` +
      (stage ? ` -- recording stage "${stage}" only` : " -- recording all 4 stages") +
      (repair ? " -- REPAIR MODE (schema-valid after array-string coercion, not as generated)\n" : "\n"),
  );
  console.log("This machine's observed generation speed is ~4 tokens/sec on CPU -- expect minutes per stage call.\n");

  const allResults: StageAttemptResult[] = [];
  for (const fixture of fixtures) {
    console.log(`  ${fixture.name} ...`);
    const fixtureResults = await runFixture(fixture, model, stage, repair, provider);
    allResults.push(...fixtureResults);
    for (const r of fixtureResults) {
      console.log(
        `    ${r.stage}: ${r.schemaValid ? `VALID${r.wasRepaired ? " (after repair)" : ""}` : `INVALID (${r.failureReason})`} (${r.processingTimeMs}ms, ${r.inputTokens}in/${r.outputTokens}out)`,
      );
    }
  }

  const runId = `likelihood-harness_${model.replace(/[:/]/g, "-")}_${repair ? "repair_" : ""}${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const manifest: LikelihoodHarnessManifest = {
    runId,
    createdAt: new Date().toISOString(),
    ollamaModel: model,
    mode: repair ? "repair" : "raw",
    gitCommit: currentGitCommit(),
    fixtureCount: fixtures.length,
    results: allResults,
    note: `${LOCAL_ONLY_LABEL}. No Ollama-vs-Claude comparison is computed here -- no cached per-stage Claude output exists to compare against. Queued for whenever live Claude spend is separately authorized.${
      repair
        ? " REPAIR MODE: schemaValid here means 'valid after JSON-string array coercion', a weaker claim than raw mode's 'valid as generated' -- see each result's wasRepaired flag."
        : ""
    }`,
  };

  mkdirSync(RUNS_DIR, { recursive: true });
  const outPath = join(RUNS_DIR, `${runId}.json`);
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));

  const validCount = allResults.filter((r) => r.schemaValid).length;
  const repairedCount = allResults.filter((r) => r.wasRepaired).length;
  console.log(
    `\n${validCount}/${allResults.length} stage calls produced schema-valid output` +
      (repair ? ` (${repairedCount} required coercion to pass)` : "") +
      ".",
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
