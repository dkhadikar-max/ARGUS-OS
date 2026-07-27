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

// Bug fix (Critical #1): the Bible's own key had no runtime dimension, so a
// decision produced by Execution Runtime v1 and one produced by the legacy
// pipeline for the SAME prospect+team+icpVersion collided on the same Redis
// key. Whichever runtime wrote last would silently serve its output to a
// request that took the OTHER path -- including a request with
// EXECUTION_RUNTIME_V1 off being served an Execution-Runtime-v1-produced
// verdict, for up to the full 24h TTL. RuntimePath makes that collision
// structurally impossible: each runtime gets its own cache entry.
export type RuntimePath = "legacy" | "execution-runtime-v1";

function cacheKey(prospectId: string, teamId: string, icpVersion: number | "none", runtime: RuntimePath): string {
  return `decision:${prospectId}:${teamId}:${icpVersion}:${runtime}`;
}

export async function getCachedDebateOutput(
  prospectId: string,
  teamId: string,
  icpVersion: number | "none",
  runtime: RuntimePath,
): Promise<AgentDebateOutput | null> {
  const raw = await redis.get(cacheKey(prospectId, teamId, icpVersion, runtime));
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
  runtime: RuntimePath,
  output: AgentDebateOutput,
): Promise<void> {
  await redis.set(
    cacheKey(prospectId, teamId, icpVersion, runtime),
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
 * via the 24h TTL instead of being actively purged. The wildcard already
 * covers the `:{runtime}` suffix too (matches everything after `teamId:`),
 * so this purges both RuntimePath variants without needing to know about
 * RuntimePath at all.
 */
export async function invalidateDecisionCache(prospectId: string, teamId: string): Promise<void> {
  const pattern = `decision:${prospectId}:${teamId}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
