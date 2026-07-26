import { createHash } from "node:crypto";
import { logger } from "../lib/logger.js";
import { buildStagePrompt, type DecisionAgentInput, type StageId } from "./orchestrator.js";
import { buildSystemPromptCacheKey } from "./prompt-cache-key.js";
import { ICP_AGENT_PROMPT, INTENT_AGENT_PROMPT, JUDGE_AGENT_PROMPT, RESEARCH_AGENT_PROMPT, RISK_AGENT_PROMPT } from "./prompts.js";

const STAGE_TEMPLATES: Record<StageId, string> = {
  research: RESEARCH_AGENT_PROMPT,
  icp: ICP_AGENT_PROMPT,
  intent: INTENT_AGENT_PROMPT,
  risk: RISK_AGENT_PROMPT,
  judge: JUDGE_AGENT_PROMPT,
};

function hashString(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export interface PromptCacheObservation {
  stage: StageId;
  cacheKey: string;
  isNewKey: boolean;
  consistent: boolean;
}

export interface CacheKeyTracker {
  observe(cacheKey: string, promptHash: string): { isNewKey: boolean; consistent: boolean };
}

/**
 * Tracks (cacheKey -> rendered-prompt hash) in memory, bounded by
 * maxEntries with simple FIFO eviction (oldest insertion first). This is
 * diagnostic-only -- Day 5 has no Redis, no persistence, no production
 * cutover -- but a real, long-running shadow rollout still shouldn't grow
 * this unboundedly.
 */
export function createCacheKeyTracker(maxEntries = 10_000): CacheKeyTracker {
  const seen = new Map<string, string>();
  return {
    observe(cacheKey, promptHash) {
      const previous = seen.get(cacheKey);
      const isNewKey = previous === undefined;
      const consistent = isNewKey || previous === promptHash;
      if (isNewKey && seen.size >= maxEntries) {
        const oldestKey = seen.keys().next().value;
        if (oldestKey !== undefined) seen.delete(oldestKey);
      }
      seen.set(cacheKey, promptHash);
      return { isNewKey, consistent };
    },
  };
}

const defaultTracker = createCacheKeyTracker();

/**
 * v4 roadmap Phase 16 Day 5 -- shadow-observes what the knowledge-pack
 * cache scheme would do for a real decision, without changing any real
 * behavior. buildStagePrompt is already the only prompt-construction path
 * (Day 1), proven byte-identical to what it replaced across 51 fixtures x
 * 5 stages (Day 4) -- there's no "old vs new" prompt construction left to
 * parallel-run.
 *
 * Correction: this used to hash the FULL rendered prompt (system +
 * userPrompt) against a key built from team-level knowledge only. That's
 * structurally guaranteed to "collide" for any two different prospects
 * sharing the same team knowledge, since userPrompt always embeds
 * prospectData/intentSignals/historicalEngagement, none of which are part
 * of that key -- it was never a real bug in the prompts, just the wrong
 * invariant being checked.
 *
 * The one thing genuinely fully determined by (stage, prompt wording,
 * companyContext) is the SYSTEM prompt -- systemPromptFor() never reads
 * prospectData/teamIcp/companyMemory/etc. That's what's checked now, via
 * buildSystemPromptCacheKey (the real L1 "cross-team cache" tier). Team/
 * knowledge-context (L2) and per-prospect (L4, never cached) caching remain
 * unstarted, separate work -- see prompt-cache-key.ts's
 * buildKnowledgeContextCacheKey for why that one isn't validated here.
 */
export function observePromptCaching(
  input: DecisionAgentInput,
  tracker: CacheKeyTracker = defaultTracker,
): PromptCacheObservation[] {
  return (Object.entries(STAGE_TEMPLATES) as Array<[StageId, string]>).map(([stage, template]) => {
    // priorOutputs is {} here -- research_output/icp_output/etc tokens
    // depend on real prior-stage agent output that doesn't exist until
    // runAgentDebate actually runs. buildStagePrompt's `system` never reads
    // priorOutputs at all (only systemPromptFor(stage, companyContext)
    // does), so this has no effect on what's being checked below.
    const built = buildStagePrompt(stage, template, input, {});
    const systemPromptHash = hashString(built.system);
    const cacheKey = buildSystemPromptCacheKey(stage, template, input.companyContext);

    const { isNewKey, consistent } = tracker.observe(cacheKey, systemPromptHash);
    if (!consistent) {
      logger.error({ stage, cacheKey }, "System-prompt cache key collision: same key produced a different system prompt");
    }
    return { stage, cacheKey, isNewKey, consistent };
  });
}
