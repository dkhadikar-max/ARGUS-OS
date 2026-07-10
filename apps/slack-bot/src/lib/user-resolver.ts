import { integrationsApi } from "./api-client.js";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: string | null; expiresAt: number }>();

function cacheKey(slackTeamId: string, slackUserId: string): string {
  return `${slackTeamId}:${slackUserId}`;
}

/** Returns the ARGUS userId linked to this Slack member, or null if the
 *  rep hasn't run `/argus link` yet (Bible §18 Epic 3). */
export async function resolveUser(slackTeamId: string, slackUserId: string): Promise<string | null> {
  const key = cacheKey(slackTeamId, slackUserId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const { userId } = await integrationsApi.resolveUser(slackTeamId, slackUserId);
  cache.set(key, { value: userId, expiresAt: Date.now() + CACHE_TTL_MS });
  return userId;
}

export function invalidateUser(slackTeamId: string, slackUserId: string): void {
  cache.delete(cacheKey(slackTeamId, slackUserId));
}
