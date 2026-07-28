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
 * Frozen as the benchmark harness for evaluating local models (2026-07-27):
 * raw mode measures the model's real output as-generated; --repair mode
 * additionally measures a bounded, documented set of primitive coercions
 * (JSON-array-string parsing, number/boolean-string coercion) and reports a
 * failure taxonomy, protocol-compliance metrics, and repair attribution so
 * future model comparisons are objective and reproducible from the same
 * harness, not from a one-off manual report. Deliberately does NOT compute
 * or claim any Ollama-vs-Claude comparison: checked the existing
 * eval/runs/*.json manifests before writing this file and confirmed no
 * per-stage Claude output is cached anywhere (only judge-level aggregates),
 * so there is nothing to compare against yet. Every result is labeled
 * LOCAL_ONLY_LABEL; the real comparison is queued for whenever live Claude
 * spend is separately authorized (Bible's own "When API Credits Are
 * Exhausted" protocol), not fabricated here.
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
 *   --repair answers a different question than the default (raw) mode.
 *   Raw mode answers "is the model's tool-call output schema-valid as-is"
 *   (what production would actually get, via the real callAgent). --repair
 *   answers "is the underlying data correct once a bounded set of known,
 *   generic mis-typings are coerced away" -- see REPAIR LAYER SCOPE below
 *   for exactly what that does and does not include. This is NOT silently
 *   folded into the default mode: a result recorded under --repair is a
 *   different, weaker claim (schema-valid after coercion, not schema-valid
 *   as generated), and the manifest's `mode` field and each result's
 *   `wasRepaired`/`repairActions` say so explicitly.
 *
 *   attempts/toolCallProduced are only tracked in --repair mode:
 *   callWithRepair owns its own retry loop, so it can observe both
 *   directly. Raw mode reuses the real production callAgent (deliberately
 *   -- see REPAIR LAYER SCOPE) which exposes neither, so those fields are
 *   null there rather than guessed from timing.
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
import { ZodError, type ZodType } from "zod";
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

// Exported (StageId, LikelihoodHarnessManifest) for eval/aggregate-likelihood-runs.ts
// to import as TYPE-ONLY -- `import type` is fully erased at compile time,
// so it does not trigger this file's own main() (which runs unconditionally
// on module load, below) as a side effect of the import.
export type StageId = "research" | "icp" | "intent" | "risk";
const ALL_STAGES: StageId[] = ["research", "icp", "intent", "risk"];

// FAILURE TAXONOMY (2026-07-27, 15-fixture repair-mode pilot, llama3.2:3b):
// A-classes are serialization-layer (the model attempted to follow the
// contract but the wire format is wrong); B-classes are model-reasoning
// (the model didn't produce the right data at all); C1 is protocol-layer
// (the model ignored tool_choice forcing entirely). A2 (serialized JSON,
// successfully coerced) isn't derived from a Zod issue -- by construction
// of repairPrimitiveFields, ANY "expected array, received string" that
// SURVIVES into a final failure proves the string wasn't valid JSON (it
// would have been coerced and removed from the error set otherwise), so
// A2's count comes from repairAttribution.json_array_parse instead. See
// classifyIssue/classifyFailureReason below for exactly how each Zod issue
// maps to one of these.
type FailureClass = "A1" | "A3" | "B1" | "B2" | "B3" | "B4" | "C1";
type TaxonomyKey = "A1" | "A2" | "A3" | "B1" | "B2" | "B3" | "B4" | "C1";

type RepairActionType = "json_array_parse" | "number_coercion" | "boolean_coercion";
interface RepairAction {
  field: string;
  action: RepairActionType;
}

interface StageAttemptResult {
  fixture: string;
  stage: StageId;
  ollamaModel: string;
  schemaValid: boolean;
  /** true only when schemaValid and at least one repair action was applied
   *  on the winning attempt. Always false in raw mode. */
  wasRepaired: boolean;
  /** Real Ollama calls this stage consumed. Null in raw mode -- see module
   *  comment. */
  attempts: number | null;
  /** Every primitive coercion applied on the LAST attempt (winning attempt
   *  on success, final failed attempt on failure) -- so repair attribution
   *  reflects real usage even on records that still ultimately failed for
   *  an unrelated field. Always [] in raw mode. */
  repairActions: RepairAction[];
  /** Whether the model's last attempt included a tool_use block at all,
   *  independent of whether its contents were schema-valid. Null in raw
   *  mode -- see module comment. */
  toolCallProduced: boolean | null;
  /** Derived from failureReason via classifyFailureReason -- works in both
   *  modes, since it's pure string/JSON classification, not something that
   *  needs callWithRepair's internal state. Empty when schemaValid. */
  failureClasses: FailureClass[];
  /** The real underlying failure reason (AppError.extra.cause, set by
   *  callAgent, in raw mode; the last attempt's raw error in --repair mode)
   *  when schemaValid is false -- could be a Zod validation message, a
   *  fetch/timeout error, or an HTTP error from Ollama itself. */
  failureReason: string | null;
  processingTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  label: typeof LOCAL_ONLY_LABEL;
}

interface ProtocolMetrics {
  /** false in raw mode: toolCallProduced isn't observable there (see
   *  module comment), so toolCallRate is null and the two schema-valid
   *  rates below are identical (raw mode never repairs). */
  trackable: boolean;
  toolCallRate: { count: number; total: number } | null;
  schemaValidBeforeRepair: { count: number; total: number };
  schemaValidAfterRepair: { count: number; total: number };
}

interface PipelineCompletionEntry {
  stage: StageId;
  fixturesAttempted: number;
  /** null in raw mode -- see module comment. "accepted" isn't a separate
   *  step from schemaValid: nothing downstream of schema validation exists
   *  in this harness yet to distinguish "valid" from "accepted". */
  toolCallsProduced: number | null;
  schemaValid: number;
}

export interface LikelihoodHarnessManifest {
  runId: string;
  createdAt: string;
  ollamaModel: string;
  mode: "raw" | "repair";
  gitCommit: string | null;
  fixtureCount: number;
  results: StageAttemptResult[];
  failureTaxonomy: Record<TaxonomyKey, number>;
  repairAttribution: Record<RepairActionType, number>;
  protocolMetrics: ProtocolMetrics;
  pipelineCompletion: PipelineCompletionEntry[];
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

// REPAIR LAYER SCOPE (frozen 2026-07-27): a serialization repair layer, NOT
// a semantic correction layer. Scoped to primitive coercion -- JSON-decoding
// a top-level field that should already be structured data (arrays), and
// parsing a top-level string that should already be a number or boolean.
// Never: inventing missing fields, interpreting prose, guessing intent, or
// reaching into array *items* (that's Class A3, a collection-element
// mismatch, deliberately left alone -- coercing inside nested objects
// blurs into "guessing structure", not primitive parsing). The 15-fixture
// pilot's B1/B2/B3/B4/C1 failures are model-reasoning or protocol problems;
// no amount of repair-layer coercion should paper over those, and none is
// added here beyond the two primitive types (array, number) actually
// observed. Boolean coercion is included for symmetry with the documented
// "primitive coercion: number parsing, boolean parsing" scope even though
// no current tool schema has a boolean-typed field -- harmless no-op today,
// correct if one is ever added.

interface PrimitiveFieldGroups {
  arrayFields: string[];
  numberFields: string[];
  booleanFields: string[];
}

/** Tool-schema-declared primitive fields (top-level only). Driven by the
 *  real ToolSchema, not a hardcoded per-stage field list, so this stays
 *  correct if RESEARCH_TOOL/ICP_TOOL/INTENT_TOOL/RISK_TOOL ever change. */
function primitiveFieldsByType(tool: ToolSchema): PrimitiveFieldGroups {
  const groups: PrimitiveFieldGroups = { arrayFields: [], numberFields: [], booleanFields: [] };
  for (const [key, def] of Object.entries(tool.input_schema.properties)) {
    if (typeof def !== "object" || def === null) continue;
    const type = (def as { type?: unknown }).type;
    if (type === "array") groups.arrayFields.push(key);
    else if (type === "number") groups.numberFields.push(key);
    else if (type === "boolean") groups.booleanFields.push(key);
  }
  return groups;
}

/** Applies every in-scope coercion (see REPAIR LAYER SCOPE) and reports
 *  exactly which fields were changed and how -- so repair attribution
 *  reflects real, individually-attributable actions, not just a boolean. */
function repairPrimitiveFields(raw: unknown, fields: PrimitiveFieldGroups): { repaired: unknown; actions: RepairAction[] } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { repaired: raw, actions: [] };
  const repaired: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  const actions: RepairAction[] = [];

  for (const field of fields.arrayFields) {
    const value = repaired[field];
    if (typeof value !== "string") continue;
    try {
      const parsedValue: unknown = JSON.parse(value);
      if (Array.isArray(parsedValue)) {
        repaired[field] = parsedValue;
        actions.push({ field, action: "json_array_parse" });
      }
    } catch {
      // not valid JSON -- leave as-is, schema.parse will report the real error
    }
  }

  for (const field of fields.numberFields) {
    const value = repaired[field];
    if (typeof value !== "string" || value.trim() === "") continue;
    const parsedValue = Number(value);
    if (Number.isFinite(parsedValue)) {
      repaired[field] = parsedValue;
      actions.push({ field, action: "number_coercion" });
    }
  }

  for (const field of fields.booleanFields) {
    const value = repaired[field];
    if (typeof value !== "string") continue;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "false") {
      repaired[field] = normalized === "true";
      actions.push({ field, action: "boolean_coercion" });
    }
  }

  return { repaired, actions };
}

interface ZodIssueLike {
  code: string;
  expected?: unknown;
  received?: unknown;
  path: (string | number)[];
}

/** Maps one Zod issue to a failure class. `expected === "array" && received
 *  === "string"` is guaranteed to be B1 (semantic substitution), never A2:
 *  repairPrimitiveFields runs on every attempt before validation, so a
 *  genuinely JSON-serialized array would already have been coerced and
 *  wouldn't appear as a surviving issue -- only non-JSON content reaches
 *  schema.parse still string-typed. Nested-path type mismatches (an array
 *  *item* wrong, not the array field itself) are A3, not A1. */
function classifyIssue(issue: ZodIssueLike): FailureClass {
  if (issue.code === "invalid_enum_value") return "B4";
  if (issue.code === "custom") return "B3"; // cross-field .refine() failures
  if (issue.code === "invalid_type") {
    if (issue.received === "undefined") return "B2"; // required field missing entirely
    if (issue.expected === "array" && issue.received === "string") return "B1";
    if (issue.path.length > 1) return "A3"; // mismatch inside a nested field/array item
    return "A1"; // top-level scalar type mismatch
  }
  return "B1"; // conservative default for any Zod issue code this schema set hasn't exhibited yet
}

/** Classifies a stored failureReason string back into failure classes.
 *  Works uniformly in both modes: raw mode's AppError.extra.cause is just
 *  callAgent's lastError.message, which for a ZodError IS the same
 *  JSON-encoded issues array --repair mode stores directly, so this one
 *  function covers both without needing callWithRepair's internal state. */
function classifyFailureReason(reason: string): FailureClass[] {
  if (/contained no tool_use block/.test(reason)) return ["C1"];
  try {
    const parsed: unknown = JSON.parse(reason);
    if (Array.isArray(parsed)) {
      return (parsed as ZodIssueLike[]).map(classifyIssue);
    }
  } catch {
    // not a JSON-encoded Zod issue array (e.g. a network/timeout error) -- fall through
  }
  return []; // unclassified rather than silently mis-bucketed
}

const REPAIR_MAX_ATTEMPTS = 2; // mirrors callAgent's own MAX_ATTEMPTS

type RepairCallOutcome<T> =
  | { ok: true; result: T; attempts: number; repairActions: RepairAction[]; toolCallProduced: true }
  | { ok: false; attempts: number; toolCallProduced: boolean; repairActions: RepairAction[]; failureReason: string };

/** callAgent's schema.parse runs on the raw provider response with no hook
 *  to fix known-bad shapes first, and callAgent is real, shared production
 *  logic -- not something to bend for a local-model-only quirk Claude has
 *  never exhibited. This is a small, harness-only parallel to callAgent's
 *  retry loop, used only in --repair mode: same real provider.call(), but
 *  repairPrimitiveFields runs on the raw tool input before schema.parse, and
 *  every attempt's outcome (tool call produced or not, actions applied) is
 *  observable -- unlike callAgent, which only exposes success/failure. */
async function callWithRepair<T>(
  system: string,
  userPrompt: string,
  tool: ToolSchema,
  schema: ZodType<T>,
  maxTokens: number,
  model: string,
  provider: OllamaProvider,
  usage: { inputTokens: number; outputTokens: number },
): Promise<RepairCallOutcome<T>> {
  const fields = primitiveFieldsByType(tool);
  let lastFailureReason = "";
  let lastToolCallProduced = false;
  let lastActions: RepairAction[] = [];

  for (let attempt = 1; attempt <= REPAIR_MAX_ATTEMPTS; attempt += 1) {
    const response = await provider.call({ model, maxTokens, system, userPrompt, tool });
    usage.inputTokens += response.inputTokens;
    usage.outputTokens += response.outputTokens;

    if (response.toolInput === null) {
      lastToolCallProduced = false;
      lastActions = [];
      lastFailureReason = `${tool.name}: Ollama response contained no tool_use block`;
      continue;
    }
    lastToolCallProduced = true;

    const { repaired, actions } = repairPrimitiveFields(response.toolInput, fields);
    lastActions = actions;
    try {
      const result = schema.parse(repaired);
      return { ok: true, result, attempts: attempt, repairActions: actions, toolCallProduced: true };
    } catch (err) {
      lastFailureReason = err instanceof ZodError ? JSON.stringify(err.issues) : err instanceof Error ? err.message : String(err);
    }
  }

  return {
    ok: false,
    attempts: REPAIR_MAX_ATTEMPTS,
    toolCallProduced: lastToolCallProduced,
    repairActions: lastActions,
    failureReason: lastFailureReason,
  };
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

  if (repair) {
    const outcome = await callWithRepair(system, userPrompt, tool, schema, maxTokens, model, provider, usage);
    if (outcome.ok) {
      results.push({
        fixture: fixtureName,
        stage,
        ollamaModel: model,
        schemaValid: true,
        wasRepaired: outcome.repairActions.length > 0,
        attempts: outcome.attempts,
        repairActions: outcome.repairActions,
        toolCallProduced: true,
        failureClasses: [],
        failureReason: null,
        processingTimeMs: Date.now() - startedAt,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        label: LOCAL_ONLY_LABEL,
      });
      return outcome.result;
    }
    results.push({
      fixture: fixtureName,
      stage,
      ollamaModel: model,
      schemaValid: false,
      wasRepaired: false,
      attempts: outcome.attempts,
      repairActions: outcome.repairActions,
      toolCallProduced: outcome.toolCallProduced,
      failureClasses: classifyFailureReason(outcome.failureReason),
      failureReason: outcome.failureReason,
      processingTimeMs: Date.now() - startedAt,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      label: LOCAL_ONLY_LABEL,
    });
    return null;
  }

  // Raw mode -- the real callAgent, same production retry/validation path.
  try {
    const output = await callAgent(system, userPrompt, tool, schema, maxTokens, usage, model, provider);
    results.push({
      fixture: fixtureName,
      stage,
      ollamaModel: model,
      schemaValid: true,
      wasRepaired: false,
      attempts: null,
      repairActions: [],
      toolCallProduced: null,
      failureClasses: [],
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
      attempts: null,
      repairActions: [],
      toolCallProduced: null,
      failureClasses: classifyFailureReason(failureReason),
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

function buildFailureTaxonomy(results: StageAttemptResult[], repairAttribution: Record<RepairActionType, number>): Record<TaxonomyKey, number> {
  const taxonomy: Record<TaxonomyKey, number> = { A1: 0, A2: 0, A3: 0, B1: 0, B2: 0, B3: 0, B4: 0, C1: 0 };
  for (const r of results) {
    for (const cls of r.failureClasses) taxonomy[cls] += 1;
  }
  taxonomy.A2 = repairAttribution.json_array_parse; // see FAILURE TAXONOMY comment above
  return taxonomy;
}

function buildRepairAttribution(results: StageAttemptResult[]): Record<RepairActionType, number> {
  const attribution: Record<RepairActionType, number> = { json_array_parse: 0, number_coercion: 0, boolean_coercion: 0 };
  for (const r of results) {
    for (const action of r.repairActions) attribution[action.action] += 1;
  }
  return attribution;
}

function buildProtocolMetrics(results: StageAttemptResult[], repair: boolean): ProtocolMetrics {
  const total = results.length;
  const toolCallCount = results.filter((r) => r.toolCallProduced === true).length;
  const rawValidCount = results.filter((r) => r.schemaValid && !r.wasRepaired).length;
  const afterRepairValidCount = results.filter((r) => r.schemaValid).length;
  return {
    trackable: repair,
    toolCallRate: repair ? { count: toolCallCount, total } : null,
    schemaValidBeforeRepair: { count: rawValidCount, total },
    schemaValidAfterRepair: { count: afterRepairValidCount, total },
  };
}

function buildPipelineCompletion(results: StageAttemptResult[], repair: boolean): PipelineCompletionEntry[] {
  const presentStages = new Set(results.map((r) => r.stage));
  return ALL_STAGES.filter((s) => presentStages.has(s)).map((stage) => {
    const stageResults = results.filter((r) => r.stage === stage);
    return {
      stage,
      fixturesAttempted: stageResults.length,
      toolCallsProduced: repair ? stageResults.filter((r) => r.toolCallProduced === true).length : null,
      schemaValid: stageResults.filter((r) => r.schemaValid).length,
    };
  });
}

async function main() {
  const { model, limit, stage, repair } = parseArgs();
  const fixtures = loadFixtures(limit);
  const provider = new OllamaProvider();

  console.log(
    `Running ${fixtures.length} fixture(s) against Ollama model "${model}" (local only, no Claude calls)` +
      (stage ? ` -- recording stage "${stage}" only` : " -- recording all 4 stages") +
      (repair ? " -- REPAIR MODE (schema-valid after primitive coercion, not as generated)\n" : "\n"),
  );
  console.log("This machine's observed generation speed is ~4 tokens/sec on CPU -- expect minutes per stage call.\n");

  const allResults: StageAttemptResult[] = [];
  for (const fixture of fixtures) {
    console.log(`  ${fixture.name} ...`);
    const fixtureResults = await runFixture(fixture, model, stage, repair, provider);
    allResults.push(...fixtureResults);
    for (const r of fixtureResults) {
      console.log(
        `    ${r.stage}: ${r.schemaValid ? `VALID${r.wasRepaired ? " (after repair)" : ""}` : `INVALID [${r.failureClasses.join(",") || "unclassified"}] (${r.failureReason})`} (${r.processingTimeMs}ms, ${r.inputTokens}in/${r.outputTokens}out)`,
      );
    }
  }

  const repairAttribution = buildRepairAttribution(allResults);
  const failureTaxonomy = buildFailureTaxonomy(allResults, repairAttribution);
  const protocolMetrics = buildProtocolMetrics(allResults, repair);
  const pipelineCompletion = buildPipelineCompletion(allResults, repair);

  const runId = `likelihood-harness_${model.replace(/[:/]/g, "-")}_${repair ? "repair_" : ""}${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const manifest: LikelihoodHarnessManifest = {
    runId,
    createdAt: new Date().toISOString(),
    ollamaModel: model,
    mode: repair ? "repair" : "raw",
    gitCommit: currentGitCommit(),
    fixtureCount: fixtures.length,
    results: allResults,
    failureTaxonomy,
    repairAttribution,
    protocolMetrics,
    pipelineCompletion,
    note: `${LOCAL_ONLY_LABEL}. No Ollama-vs-Claude comparison is computed here -- no cached per-stage Claude output exists to compare against. Queued for whenever live Claude spend is separately authorized.${
      repair
        ? " REPAIR MODE: schemaValid here means 'valid after primitive coercion', a weaker claim than raw mode's 'valid as generated' -- see each result's wasRepaired/repairActions."
        : ""
    }`,
  };

  mkdirSync(RUNS_DIR, { recursive: true });
  const outPath = join(RUNS_DIR, `${runId}.json`);
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));

  const validCount = allResults.filter((r) => r.schemaValid).length;
  console.log(`\n${validCount}/${allResults.length} stage calls produced schema-valid output.`);
  console.log(`Failure taxonomy: ${JSON.stringify(failureTaxonomy)}`);
  console.log(`Repair attribution: ${JSON.stringify(repairAttribution)}`);
  if (repair) {
    console.log(
      `Protocol compliance: tool call ${protocolMetrics.toolCallRate?.count}/${protocolMetrics.toolCallRate?.total}, ` +
        `schema-valid before repair ${protocolMetrics.schemaValidBeforeRepair.count}/${protocolMetrics.schemaValidBeforeRepair.total}, ` +
        `after repair ${protocolMetrics.schemaValidAfterRepair.count}/${protocolMetrics.schemaValidAfterRepair.total}`,
    );
  }
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
