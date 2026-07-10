import { redis } from "./redis.js";

// Bible §9.2 Redis schema: `channel:team:{teamId}` carries decision/outcome
// updates to real-time consumers. §10.6 documents the WebSocket server as
// one consumer; the Slack Bot (§18 Epic 3) is a second — it subscribes to
// the same channel to push proactive alerts (§6.4) instead of polling.
export type TeamEvent =
  | { type: "decision.created"; data: { decisionId: string; teamId: string; userId: string } }
  | { type: "outcome.logged"; data: { decisionId: string; teamId: string; userId: string; outcomeType: string } };

export async function publishTeamEvent(teamId: string, event: TeamEvent): Promise<void> {
  await redis.publish(`channel:team:${teamId}`, JSON.stringify(event));
}
