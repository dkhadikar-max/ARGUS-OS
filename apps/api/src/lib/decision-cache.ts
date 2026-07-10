import type { AgentDebateOutput } from "@argus/shared";
import { redis } from "./redis.js";

// Bible §9.2 Redis schema: `decision:{prospectHash}:{teamId}:{icpVersion} →
// JSON (TTL: 24h)`. Caches the Judge/agent-debate output (the expensive
// Claude call, ~$0.04-0.06 and several seconds per §8.1/§13.1) rather than
// the final API response — a decision request should still create its own
// Decision row every time (each request is its own auditable event, per
// §9.1's immutability requirement), it just doesn't need to re-run the AI
// debate if nothing relevant has changed since the last identical request.
// "prospectHash" in the Bible's key is realized here as the Prospect's own
// id: Prospect is already deduplicated by linkedInUrl (§9.1 @unique), so
// its id already is a stable hash of prospect identity.
const CACHE_TTL_SECONDS = 24 * 60 * 60;

function cacheKey(prospectId: string, teamId: string, icpVersion: number | "none"): string {
  return `decision:${prospectId}:${teamId}:${icpVersion}`;
}

export async function getCachedDebateOutput(
  prospectId: string,
  teamId: string,
  icpVersion: number | "none",
): Promise<AgentDebateOutput | null> {
  const raw = await redis.get(cacheKey(prospectId, teamId, icpVersion));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AgentDebateOutput;
  } catch {
    return null; // corrupt cache entry — treat as a miss rather than throwing
  }
}

export async function setCachedDebateOutput(
  prospectId: string,
  teamId: string,
  icpVersion: number | "none",
  output: AgentDebateOutput,
): Promise<void> {
  await redis.set(
    cacheKey(prospectId, teamId, icpVersion),
    JSON.stringify(output),
    "EX",
    CACHE_TTL_SECONDS,
  );
}

/**
 * Bible §18 AI-5 "Cache invalidation rules". Called when new ground truth
 * exists for this prospect (an outcome was logged) that the cached debate
 * output's `historicalEngagement` input didn't have — the cached verdict
 * is now based on stale context. ICP changes don't need explicit
 * invalidation here: they naturally fall out of the key (a new
 * `icpVersion` is simply a cache miss), so old-version entries just expire
 * via the 24h TTL instead of being actively purged.
 */
export async function invalidateDecisionCache(prospectId: string, teamId: string): Promise<void> {
  const pattern = `decision:${prospectId}:${teamId}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
