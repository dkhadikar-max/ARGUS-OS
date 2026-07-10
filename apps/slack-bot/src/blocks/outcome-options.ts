import type { KnownBlock } from "@slack/types";
import type { OutcomeType } from "@argus/shared";

// Bible §6.4: outcome logging is a plain in-channel button row ("Great!
// What happened? [Meeting Booked] [Replied — No Meeting] [No Response]
// [Negative Response]"), not a modal — so this builds an Actions block,
// not a Slack View.
//
// "Negative Response" has no matching Prisma OutcomeType (§9.1 only has
// NO_RESPONSE / REPLIED_NO_MEETING / MEETING_BOOKED / OPPORTUNITY_CREATED /
// CLOSED_WON / CLOSED_LOST / DISQUALIFIED / SNOOZED) — DISQUALIFIED is the
// closest fit: the prospect actively said no, which disqualifies them
// rather than leaving the door open the way REPLIED_NO_MEETING implies.
const OUTCOME_OPTIONS: Array<{ label: string; type: OutcomeType }> = [
  { label: "Meeting Booked", type: "MEETING_BOOKED" },
  { label: "Replied — No Meeting", type: "REPLIED_NO_MEETING" },
  { label: "No Response", type: "NO_RESPONSE" },
  { label: "Negative Response", type: "DISQUALIFIED" },
];

export function buildOutcomeOptionsBlocks(decisionId: string): KnownBlock[] {
  return [
    { type: "section", text: { type: "mrkdwn", text: "Great! What happened?" } },
    {
      type: "actions",
      block_id: `outcome_actions_${decisionId}`,
      elements: OUTCOME_OPTIONS.map((option) => ({
        type: "button",
        text: { type: "plain_text", text: option.label },
        action_id: `outcome_log_${option.type}`,
        value: decisionId,
      })),
    },
  ];
}
