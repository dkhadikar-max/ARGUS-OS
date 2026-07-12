import type { KnownBlock } from "@slack/types";
import type { DecisionResponse } from "@argus/shared";

const VERDICT_LABEL: Record<DecisionResponse["verdict"], string> = {
  STRONG_YES: "STRONG YES",
  YES: "YES",
  WAIT: "WAIT",
  PASS: "PASS",
  HARD_PASS: "HARD PASS",
};

const VERDICT_EMOJI: Record<DecisionResponse["verdict"], string> = {
  STRONG_YES: "🟢",
  YES: "🟢",
  WAIT: "🟡",
  PASS: "🟠",
  HARD_PASS: "🔴",
};

/** Bible §6.4 Slack Bot alert flow, rebuilt in Block Kit from the same
 *  DecisionResponse the LinkedIn sidebar renders. */
export function buildDecisionAlertBlocks(decision: DecisionResponse): KnownBlock[] {
  const evidenceLines = decision.evidence
    .slice(0, 4)
    .map((e) => `• *${e.type}:* ${e.signal}`)
    .join("\n");

  const message = decision.message.linkedin ?? decision.message.email ?? "";

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*New Lead:* ${decision.prospect.name}${decision.prospect.title ? `, ${decision.prospect.title}` : ""}${decision.prospect.companyName ? ` @ ${decision.prospect.companyName}` : ""}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${VERDICT_EMOJI[decision.verdict]} *Verdict:* ${VERDICT_LABEL[decision.verdict]} (${decision.confidence}% confidence)`,
      },
    },
  ];

  // ARGUS Unanimous Policy v2.1 L4 Policy Engine (not the Bible) -- shown
  // right after the verdict, before evidence/reasoning, so a rep sees a
  // BLOCK/REQUIRE_APPROVAL/FLAG before deciding whether to click "Accept &
  // Message" at all, the same reasoning QueueItemCard.tsx's own proactive
  // display already uses on the dashboard side.
  if (decision.policyFlags && decision.policyFlags.length > 0) {
    const policyEmoji: Record<string, string> = { BLOCK: "⛔", REQUIRE_APPROVAL: "⚠️", FLAG: "⚠️" };
    const policyLines = decision.policyFlags
      .map((flag) => `${policyEmoji[flag.action] ?? "⚠️"} *${flag.action}:* ${flag.message}`)
      .join("\n");
    blocks.push({ type: "section", text: { type: "mrkdwn", text: policyLines } });
  }

  if (evidenceLines) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: evidenceLines } });
  }

  blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Reasoning:* ${decision.reasoning}` } });

  if (message) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Suggested message:*\n>${message}` },
    });
  }

  blocks.push({
    type: "actions",
    block_id: `decision_actions_${decision.id}`,
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Accept & Message" },
        style: "primary",
        action_id: "decision_accept",
        value: decision.id,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Edit First" },
        action_id: "decision_edit",
        value: decision.id,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Pass" },
        action_id: "decision_pass",
        value: decision.id,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "View More" },
        action_id: "decision_view_more",
        value: decision.id,
      },
    ],
  });

  return blocks;
}
