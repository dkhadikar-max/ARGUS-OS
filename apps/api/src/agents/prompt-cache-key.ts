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

export function hashCompanyContext(companyContext: string | null): string {
  return createHash("sha256")
    .update(companyContext ?? "")
    .digest("hex");
}

/**
 * Cache key for the ONE thing that's actually fully determined by
 * (stage, prompt wording, companyContext): the SYSTEM prompt --
 * systemPromptFor() never reads prospectData/teamIcp/companyMemory/etc, only
 * companyContext (see orchestrator.ts). This is the real L1 "cross-team
 * cache" tier from the Day 5 shadow-observation design; it's the only key
 * this module builds that's safe to validate "same key -> same content"
 * against, and prompt-cache-shadow.ts's observePromptCaching does exactly
 * that (against built.system only, never the full rendered prompt).
 */
export function buildSystemPromptCacheKey(stageName: StageId, promptTemplate: string, companyContext: string | null): string {
  return `system:${stageName}:${hashPromptTemplate(promptTemplate)}:${hashCompanyContext(companyContext)}`;
}

/**
 * A key over a stage's prompt wording + a team's knowledge fields
 * (teamIcp/companyMemory/teamHistory/userPreferences/teamPatterns -- see
 * decision-context-builder.ts's hashKnowledgeFields). Correction, made
 * after a real bug: this key does NOT characterize "one stage's rendered
 * prompt" the way an earlier version of this docstring claimed --
 * buildStagePrompt's userPrompt also embeds prospectData/intentSignals/
 * historicalEngagement, none of which are part of knowledgeHash, so two
 * different prospects sharing the same team knowledge get the SAME key
 * here but a genuinely DIFFERENT rendered userPrompt. Observed for real in
 * decision.service.test.ts once its orchestrator mock was fixed to expose
 * buildStagePrompt -- see prompt-cache-shadow.ts's git history.
 *
 * Kept for a possible future L2 cache of a team-level prefix, but NOT
 * currently validated against any rendered content -- that would require
 * fillPlaceholders to expose the team-level portion of a user prompt
 * separately from the prospect-level portion, which it doesn't today.
 * Not called by observePromptCaching; not wired anywhere yet.
 */
export function buildTeamKnowledgeCacheKey(stageName: StageId, promptTemplate: string, knowledgeHash: string): string {
  return `team-knowledge:${stageName}:${hashPromptTemplate(promptTemplate)}:${knowledgeHash}`;
}
