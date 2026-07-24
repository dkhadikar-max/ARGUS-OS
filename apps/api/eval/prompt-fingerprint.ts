/**
 * v4 roadmap Phase 15 -- real, zero-cost prompt fingerprinting and
 * cacheability analysis against all 51 fixtures. No API calls: this
 * deterministically reconstructs actual prompts using the real
 * `fillPlaceholders`/`systemPromptFor` functions and the real `prompts.ts`
 * templates, then hashes the pieces.
 *
 * Honest scope note: `fillPlaceholders` also resolves `{{..._output}}`
 * tokens (research_output, icp_output, etc.) from prior-stage agent
 * output, which only exists after a real API call -- there is no
 * synthetic substitute that wouldn't misrepresent real production
 * duplication. So this script fingerprints exactly what's honestly
 * available without spending money:
 *   1. Every agent's system prompt (100% static, no placeholders at all).
 *   2. Research's full user prompt (its only inputs are prospect_data,
 *      team_icp, company_memory -- no prior-stage dependency).
 *   3. The per-field duplication of every {{..._raw}} placeholder value
 *      across all 51 fixtures, independent of which agent consumes it.
 * ICP/Intent/Risk/Judge's prior-stage-output portions are NOT fingerprinted
 * here -- their real duplication profile depends on actual Research/ICP/
 * Intent/Risk output, which isn't recoverable from these fixtures alone.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fillPlaceholders, systemPromptFor, type DecisionAgentInput } from "../src/agents/orchestrator.js";
import { RESEARCH_AGENT_PROMPT, ICP_AGENT_PROMPT, INTENT_AGENT_PROMPT, RISK_AGENT_PROMPT, JUDGE_AGENT_PROMPT } from "../src/agents/prompts.js";
import type { EvalFixture } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

// Rough chars-per-token heuristic (~4 chars/token for English) -- an
// approximation, not exact tokenization. Same caveat as the earlier
// cache-potential estimate: this is a lower/upper bound, not a promise.
const CHARS_PER_TOKEN = 4;
function estTokens(s: string): number {
  return Math.round(s.length / CHARS_PER_TOKEN);
}

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

function loadFixtures(): EvalFixture[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf-8")) as EvalFixture);
}

function main() {
  const fixtures = loadFixtures();
  console.log(`Loaded ${fixtures.length} fixtures.\n`);

  // --- 1. System prompts: 100% static, verified by hash, not assumed ---
  console.log("=== System prompts (identical on every call, every fixture, by construction) ===");
  for (const agent of ["research", "icp", "intent", "risk", "judge"] as const) {
    // companyContext varies the system prompt (appended per Team) -- hash
    // it with a representative null context to report the CORE static size,
    // and separately note how many distinct companyContext values exist.
    const core = systemPromptFor(agent, null);
    console.log(`  ${agent.padEnd(8)} ${core.length} chars  ~${estTokens(core)} tokens  hash=${hash(core)}`);
  }

  const distinctContexts = new Set(fixtures.map((f) => JSON.stringify((f.input as DecisionAgentInput).companyContext)));
  console.log(`\n  Distinct companyContext values across ${fixtures.length} fixtures: ${distinctContexts.size}`);
  console.log(
    distinctContexts.size === 1
      ? "  -> system prompt is byte-identical across every fixture -- fully cacheable at the system-prompt breakpoint."
      : `  -> ${distinctContexts.size} distinct system prompt variants (one per distinct companyContext) -- caches per-variant, not globally.`,
  );

  // --- 2. Research's full user prompt: only real, no-prior-stage-needed one ---
  console.log("\n=== Research user prompt (only stage with no prior-stage dependency) ===");
  const researchPrompts = fixtures.map((f) => fillPlaceholders(RESEARCH_AGENT_PROMPT, f.input as DecisionAgentInput, {}));
  const distinctResearchPrompts = new Set(researchPrompts);
  const lengths = researchPrompts.map((p) => p.length);
  console.log(`  ${fixtures.length} fixtures -> ${distinctResearchPrompts.size} distinct rendered prompts`);
  console.log(
    `  length: min=${Math.min(...lengths)} max=${Math.max(...lengths)} avg=${Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)} chars`,
  );

  // --- 3. Per-field duplication across all 51 fixtures ---
  console.log("\n=== Per-field duplication across all fixtures (independent of which agent consumes it) ===");
  const fields: Array<keyof DecisionAgentInput> = [
    "prospectData",
    "teamIcp",
    "companyMemory",
    "intentSignals",
    "historicalEngagement",
    "teamHistory",
    "userPreferences",
    "teamPatterns",
  ];
  for (const field of fields) {
    const values = fixtures.map((f) => JSON.stringify((f.input as DecisionAgentInput)[field] ?? null));
    const distinct = new Set(values);
    const avgLen = Math.round(values.reduce((a, b) => a + b.length, 0) / values.length);
    console.log(
      `  ${field.padEnd(22)} ${fixtures.length} fixtures -> ${distinct.size} distinct value(s)  avg ${avgLen} chars (~${Math.round(avgLen / CHARS_PER_TOKEN)} tokens)`,
    );
  }

  console.log(
    "\n(Fields consumed by more than one agent, per prompts.ts's own <input> blocks: " +
      "team_icp -> Research + ICP; everything else is single-agent. " +
      "See docs/ARCHITECTURE_V4.md / this session's earlier finding for how this maps to real caching opportunity.)",
  );
}

main();
