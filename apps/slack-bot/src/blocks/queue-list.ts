import type { KnownBlock } from "@slack/types";
import type { QueueResponse } from "@argus/shared";

const VERDICT_LABEL: Record<QueueResponse["items"][number]["verdict"], string> = {
  STRONG_YES: "STRONG YES",
  YES: "YES",
  WAIT: "WAIT",
  PASS: "PASS",
  HARD_PASS: "HARD PASS",
};

/** Bible §6.2 Today Queue, rendered as a Slack Block Kit list for the
 *  `/argus-queue` command (§18 SLK-4). */
export function buildQueueBlocks(queue: QueueResponse): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Today's Queue — ${queue.stats.total} prospects` },
    },
  ];

  if (queue.items.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "Nothing in your queue right now — nice work staying on top of it." },
    });
    return blocks;
  }

  for (const item of queue.items.slice(0, 10)) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*#${item.rank} ${VERDICT_LABEL[item.verdict]} ${item.confidence}%* — ${item.prospect.name}${item.prospect.title ? `, ${item.prospect.title}` : ""}${item.prospect.companyName ? ` @ ${item.prospect.companyName}` : ""}\n${item.reason} · ${item.lastActivity}`,
      },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "View" },
        action_id: "queue_view_decision",
        value: item.decisionId,
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${queue.stats.strongYes} strong yes · ${queue.stats.yes} yes · ${queue.stats.wait} wait · ${queue.stats.pass} pass · ${queue.stats.newSinceYesterday} new since yesterday`,
      },
    ],
  });

  return blocks;
}
