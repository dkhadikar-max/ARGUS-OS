import type { SlackTeamResolution } from "@argus/shared";
import { integrationsApi } from "./api-client.js";

// One Slack Bot process serves every connected ARGUS team (Bible §18 Epic
// 3), so every incoming event needs a slackTeamId -> ARGUS team lookup.
// Doing that over HTTP on every single Slack event would add a needless
// round trip to apps/api for data that changes only when a team
// reconnects/disconnects Slack — a short in-memory TTL cache is the
// pragmatic middle ground between "always fresh" and "always fast".
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: SlackTeamResolution; expiresAt: number }>();

export async function resolveTeam(slackTeamId: string): Promise<SlackTeamResolution> {
  const cached = cache.get(slackTeamId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const resolution = await integrationsApi.resolveTeam(slackTeamId);
  cache.set(slackTeamId, { value: resolution, expiresAt: Date.now() + CACHE_TTL_MS });
  return resolution;
}

export function invalidateTeam(slackTeamId: string): void {
  cache.delete(slackTeamId);
}
