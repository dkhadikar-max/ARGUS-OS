import { createHash } from "node:crypto";
import type { StageId } from "./orchestrator.js";

// v4 roadmap Phase 16 Day 3 (docs/ARCHITECTURE_V4.md) -- refinement #3:
// this hashing is deliberately kept entirely out of buildStagePrompt
// (orchestrator.ts). Prompt construction's job is rendering {system,
// userPrompt}; deciding whether that render is cacheable is a separate
// concern, owned here and composed by the caller (Day 5's cache read/write
// path) as plain data, not embedded in prompt construction itself.

/**
 * Hashes the prompt TEMPLATE's own content (e.g. RESEARCH_AGENT_PROMPT),
 * not a rendered prompt. Used as the cache key's "did the wording change"
 * component -- hashing the template guarantees any edit to prompts.ts
 * invalidates the cache immediately, without depending on a developer
 * remembering to bump a manually-maintained version string.
 */
export function hashPromptTemplate(promptTemplate: string): string {
  return createHash("sha256").update(promptTemplate).digest("hex");
}

/**
 * Full cache key for one stage's rendered prompt: which stage, whether the
 * prompt wording changed (promptTemplate's own hash), and whether the
 * team's knowledge changed (knowledgeHash, from
 * decision-context-builder.ts's hashKnowledgeFields -- computed by the
 * caller, not here). Deliberately excludes anything prospect-specific:
 * per-prospect content is never cached (see hashKnowledgeFields' own scoping
 * note), so it has no place in a cache key either.
 */
export function buildPromptCacheKey(stageName: StageId, promptTemplate: string, knowledgeHash: string): string {
  return `prompt:${stageName}:${hashPromptTemplate(promptTemplate)}:${knowledgeHash}`;
}
