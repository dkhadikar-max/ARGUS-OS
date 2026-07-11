import { randomBytes } from "node:crypto";
import { redis } from "../../lib/redis.js";

// Standard OAuth `state` CSRF-protection pattern: a random, single-use,
// short-lived token stored server-side (Redis) mapped to the ARGUS
// team/user that initiated the flow. Only the random token travels through
// the browser and back from Slack — never the teamId itself — so it can't
// be guessed or replayed after use or expiry.
const STATE_TTL_SECONDS = 10 * 60;

function stateKey(state: string): string {
  return `slack_oauth_state:${state}`;
}

export interface OAuthStateData {
  teamId: string;
  userId: string;
}

export async function createOAuthState(data: OAuthStateData): Promise<string> {
  const state = randomBytes(24).toString("hex");
  await redis.set(stateKey(state), JSON.stringify(data), "EX", STATE_TTL_SECONDS);
  return state;
}

/** Single-use: deletes the state as it's read, so a replayed `state` value
 *  (e.g. the callback URL being hit twice) fails on the second attempt. */
export async function consumeOAuthState(state: string): Promise<OAuthStateData | null> {
  const raw = await redis.get(stateKey(state));
  if (!raw) return null;
  await redis.del(stateKey(state));
  return JSON.parse(raw) as OAuthStateData;
}
