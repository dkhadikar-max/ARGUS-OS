import { Redis } from "ioredis";
import { WebClient } from "@slack/web-api";
import { env } from "../config/env.js";
import { argusApi, integrationsApi } from "./api-client.js";
import { buildDecisionAlertBlocks } from "../blocks/decision-alert.js";

interface TeamEvent {
  type: "decision.created" | "outcome.logged";
  data: { decisionId: string; teamId: string; userId: string };
}

/**
 * Bible §9.2 Redis schema: `channel:team:{teamId}` — §10.6 documents the
 * WebSocket server as one consumer of this pub/sub channel; this is the
 * second (§18 Epic 3's proactive alert delivery, §6.4). Pattern-subscribing
 * to `channel:team:*` means one connection covers every connected team
 * without per-team subscribe/unsubscribe bookkeeping as teams connect Slack.
 */
export function startTeamAlertListener(): Redis {
  const subscriber = new Redis(env.REDIS_URL);

  subscriber.psubscribe("channel:team:*", (err: Error | null | undefined) => {
    if (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to subscribe to channel:team:*", err);
    }
  });

  subscriber.on("pmessage", (_pattern: string, _channel: string, message: string) => {
    void handleTeamEvent(message);
  });

  return subscriber;
}

async function handleTeamEvent(raw: string): Promise<void> {
  let event: TeamEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return;
  }

  if (event.type !== "decision.created") return; // outcome.logged has no Slack-side action yet

  const slack = await integrationsApi.resolveByArgusTeam(event.data.teamId);
  if (!slack) return; // this ARGUS team hasn't connected Slack

  const decision = await argusApi.getDecision({ apiKey: slack.apiKey }, event.data.decisionId);
  const client = new WebClient(slack.botToken);

  await client.chat.postMessage({
    channel: slack.alertChannelId,
    text: `New lead: ${decision.prospect.name} — ${decision.verdict} (${decision.confidence}% confidence)`,
    blocks: buildDecisionAlertBlocks(decision),
  });
}
