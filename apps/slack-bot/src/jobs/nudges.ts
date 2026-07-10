import { Queue, Worker, type Job } from "bullmq";
import { WebClient } from "@slack/web-api";
import { env } from "../config/env.js";
import { resolveTeam } from "../lib/team-resolver.js";
import { argusApi } from "../lib/api-client.js";

// Bible §9.2 Redis schema names this queue `queue:notifications`; §16.2
// Risk #5 mitigation: "Slack bot sends outcome nudges at T+1 day, T+3
// days, T+7 days" so the Decision Graph's learning loop doesn't stall on
// missing outcomes.
const QUEUE_NAME = "queue:notifications";

export interface OutcomeNudgeJobData {
  decisionId: string;
  slackTeamId: string;
  slackUserId: string;
  prospectName: string;
}

const connection = { url: env.REDIS_URL };

export const nudgeQueue = new Queue<OutcomeNudgeJobData>(QUEUE_NAME, { connection });

const DAY_MS = 24 * 60 * 60 * 1000;

export async function scheduleOutcomeNudges(data: OutcomeNudgeJobData): Promise<void> {
  await Promise.all(
    [1, 3, 7].map((days) =>
      nudgeQueue.add(`nudge-${data.decisionId}-t${days}`, data, {
        delay: days * DAY_MS,
        removeOnComplete: true,
        removeOnFail: true,
      }),
    ),
  );
}

/** Cancels any pending nudges once the outcome is logged (Bible §5.3 —
 *  a logged outcome closes the learning loop; further nudges would be noise). */
export async function cancelOutcomeNudges(decisionId: string): Promise<void> {
  const jobs = await nudgeQueue.getDelayed();
  await Promise.all(
    jobs.filter((job) => job.data.decisionId === decisionId).map((job) => job.remove()),
  );
}

async function sendNudge(job: Job<OutcomeNudgeJobData>): Promise<void> {
  const { decisionId, slackTeamId, slackUserId, prospectName } = job.data;

  const team = await resolveTeam(slackTeamId);
  const decision = await argusApi.getDecision({ apiKey: team.apiKey }, decisionId);
  if (decision.outcome) {
    return; // already logged — Bible §16.2: nudges should stop once closed
  }

  const client = new WebClient(team.botToken);
  const dm = await client.conversations.open({ users: slackUserId });
  const channelId = dm.channel?.id;
  if (!channelId) return;

  await client.chat.postMessage({
    channel: channelId,
    text: `Reminder: did anything happen with ${prospectName}? Logging the outcome helps ARGUS learn.`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Reminder:* did anything happen with *${prospectName}*? Logging the outcome helps ARGUS learn.`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Log Outcome" },
            action_id: "nudge_log_outcome",
            value: decisionId,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Not relevant" },
            action_id: "nudge_dismiss",
            value: decisionId,
          },
        ],
      },
    ],
  });
}

export function startNudgeWorker(): Worker<OutcomeNudgeJobData> {
  return new Worker<OutcomeNudgeJobData>(QUEUE_NAME, sendNudge, { connection });
}
