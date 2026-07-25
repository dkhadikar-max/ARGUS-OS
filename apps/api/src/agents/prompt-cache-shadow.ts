import { createHash } from "node:crypto";
import { logger } from "../lib/logger.js";
import { hashKnowledgeFields } from "./decision-context-builder.js";
import { buildStagePrompt, type DecisionAgentInput, type StageId } from "./orchestrator.js";
import { buildPromptCacheKey } from "./prompt-cache-key.js";
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
 * parallel-run. What's actually unvalidated is the cache-KEY scheme
 * itself: does the same (stage, promptHash, knowledgeHash) key really
 * always correspond to the same rendered prompt under real traffic? That's
 * the one real invariant this checks, and the only thing gated by
 * USE_KNOWLEDGE_PACK -- the real runAgentDebate call this feeds into is
 * never altered, skipped, or short-circuited.
 */
export function observePromptCaching(
  input: DecisionAgentInput,
  tracker: CacheKeyTracker = defaultTracker,
): PromptCacheObservation[] {
  const knowledgeHash = hashKnowledgeFields(input);

  return (Object.entries(STAGE_TEMPLATES) as Array<[StageId, string]>).map(([stage, template]) => {
    // priorOutputs is {} here -- research_output/icp_output/etc tokens
    // depend on real prior-stage agent output that doesn't exist until
    // runAgentDebate actually runs. That substitution renders the same
    // literal placeholder text regardless of knowledge, so it doesn't
    // affect whether this key scheme is internally consistent.
    const built = buildStagePrompt(stage, template, input, {});
    const promptHash = hashString(`${built.system} ${built.userPrompt}`);
    const cacheKey = buildPromptCacheKey(stage, template, knowledgeHash);

    const { isNewKey, consistent } = tracker.observe(cacheKey, promptHash);
    if (!consistent) {
      logger.error({ stage, cacheKey }, "Knowledge-pack cache key collision: same key produced a different prompt");
    }
    return { stage, cacheKey, isNewKey, consistent };
  });
}
