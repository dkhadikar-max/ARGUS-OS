import type { App, BlockAction, ButtonAction } from "@slack/bolt";
import type { OutcomeType } from "@argus/shared";
import { resolveTeam } from "../lib/team-resolver.js";
import { resolveUser } from "../lib/user-resolver.js";
import { argusApi } from "../lib/api-client.js";
import { buildOutcomeOptionsBlocks } from "../blocks/outcome-options.js";
import { cancelOutcomeNudges } from "../jobs/nudges.js";

function decisionIdFrom(body: BlockAction): string {
  const action = body.actions[0] as ButtonAction;
  if (!action.value) {
    throw new Error("Button action was missing its decision id value");
  }
  return action.value;
}

async function requireLinkedUser(
  respond: (msg: { response_type: "ephemeral"; text: string }) => Promise<unknown>,
  slackTeamId: string,
  slackUserId: string,
): Promise<{ apiKey: string; argusUserId: string } | null> {
  const [team, argusUserId] = await Promise.all([
    resolveTeam(slackTeamId),
    resolveUser(slackTeamId, slackUserId),
  ]);

  if (!argusUserId) {
    await respond({ response_type: "ephemeral", text: "Run `/argus link` first so I know which ARGUS account you are." });
    return null;
  }
  return { apiKey: team.apiKey, argusUserId };
}

// Bible §6.4 Slack alert flow + §18 SLK-2/SLK-3.
export function registerActionHandlers(app: App): void {
  app.action("decision_accept", async ({ ack, body, respond, client }) => {
    await ack();
    const decisionId = decisionIdFrom(body as BlockAction);
    const b = body as BlockAction;
    const auth = await requireLinkedUser(respond, b.team?.id ?? "", b.user.id);
    if (!auth) return;

    const decision = await argusApi.getDecision({ apiKey: auth.apiKey, actingUserId: auth.argusUserId }, decisionId);

    const dm = await client.conversations.open({ users: b.user.id });
    if (dm.channel?.id) {
      const message = decision.message.linkedin ?? decision.message.email ?? "(no message generated)";
      await client.chat.postMessage({
        channel: dm.channel.id,
        text: `Message for ${decision.prospect.name}:\n${message}`,
      });
    }

    await respond({
      response_type: "ephemeral",
      text: "Tracked: decision accepted. Message sent to your DMs — don't forget to log the outcome when they reply!",
    });

    const { scheduleOutcomeNudges } = await import("../jobs/nudges.js");
    await scheduleOutcomeNudges({
      decisionId,
      slackTeamId: b.team?.id ?? "",
      slackUserId: b.user.id,
      prospectName: decision.prospect.name,
    });
  });

  app.action("decision_pass", async ({ ack, body, respond }) => {
    await ack();
    const decisionId = decisionIdFrom(body as BlockAction);
    const b = body as BlockAction;
    const auth = await requireLinkedUser(respond, b.team?.id ?? "", b.user.id);
    if (!auth) return;

    await argusApi.overrideDecision(
      { apiKey: auth.apiKey, actingUserId: auth.argusUserId },
      decisionId,
      { newVerdict: "PASS" },
    );
    await respond({ response_type: "ephemeral", text: "Passed. This won't show up in your queue again." });
  });

  app.action("decision_edit", async ({ ack, body, client }) => {
    await ack();
    const decisionId = decisionIdFrom(body as BlockAction);
    const b = body as BlockAction;
    const auth = await requireLinkedUser(
      async () => undefined,
      b.team?.id ?? "",
      b.user.id,
    );
    if (!auth) return;

    const decision = await argusApi.getDecision({ apiKey: auth.apiKey, actingUserId: auth.argusUserId }, decisionId);

    await client.views.open({
      trigger_id: b.trigger_id,
      view: {
        type: "modal",
        callback_id: "decision_edit_submit",
        private_metadata: decisionId,
        title: { type: "plain_text", text: "Edit message" },
        submit: { type: "plain_text", text: "Copy" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "input",
            block_id: "message_block",
            label: { type: "plain_text", text: "Message" },
            element: {
              type: "plain_text_input",
              action_id: "message_input",
              multiline: true,
              initial_value: decision.message.linkedin ?? decision.message.email ?? "",
            },
          },
        ],
      },
    });
  });

  app.view("decision_edit_submit", async ({ ack, view, body, client }) => {
    await ack();
    const edited = view.state.values["message_block"]?.["message_input"]?.value ?? "";
    const dm = await client.conversations.open({ users: body.user.id });
    if (dm.channel?.id) {
      await client.chat.postMessage({ channel: dm.channel.id, text: `Your edited message:\n${edited}` });
    }
    // Bible §10 has no "update message draft" endpoint (the LinkedIn
    // sidebar's own edit is client-local too, see apps/extension
    // MessageComposer.tsx) — this edit is likewise not persisted server-side.
  });

  app.action("decision_view_more", async ({ ack, body, respond }) => {
    await ack();
    const decisionId = decisionIdFrom(body as BlockAction);
    const b = body as BlockAction;
    const auth = await requireLinkedUser(respond, b.team?.id ?? "", b.user.id);
    if (!auth) return;

    const decision = await argusApi.getDecision({ apiKey: auth.apiKey, actingUserId: auth.argusUserId }, decisionId);
    const lines = decision.evidence.map((e) => `• *${e.type}* (${e.confidence}%): ${e.signal} — ${e.relevance}`);

    await respond({
      response_type: "ephemeral",
      text: [`*Full evidence for ${decision.prospect.name}:*`, ...lines].join("\n"),
    });
  });

  app.action("queue_view_decision", async ({ ack, body, respond }) => {
    await ack();
    const decisionId = decisionIdFrom(body as BlockAction);
    const b = body as BlockAction;
    const auth = await requireLinkedUser(respond, b.team?.id ?? "", b.user.id);
    if (!auth) return;

    const decision = await argusApi.getDecision({ apiKey: auth.apiKey, actingUserId: auth.argusUserId }, decisionId);
    const { buildDecisionAlertBlocks } = await import("../blocks/decision-alert.js");
    await respond({ response_type: "ephemeral", blocks: buildDecisionAlertBlocks(decision) });
  });

  app.action("nudge_log_outcome", async ({ ack, body, respond }) => {
    await ack();
    const decisionId = decisionIdFrom(body as BlockAction);
    await respond({ response_type: "ephemeral", blocks: buildOutcomeOptionsBlocks(decisionId) });
  });

  app.action("nudge_dismiss", async ({ ack, body }) => {
    await ack();
    const decisionId = decisionIdFrom(body as BlockAction);
    await cancelOutcomeNudges(decisionId);
  });

  const OUTCOME_TYPES: OutcomeType[] = [
    "MEETING_BOOKED",
    "REPLIED_NO_MEETING",
    "NO_RESPONSE",
    "OPPORTUNITY_CREATED",
    "CLOSED_WON",
    "CLOSED_LOST",
    "DISQUALIFIED",
    "SNOOZED",
  ];

  for (const outcomeType of OUTCOME_TYPES) {
    app.action(`outcome_log_${outcomeType}`, async ({ ack, body, respond }) => {
      await ack();
      const decisionId = decisionIdFrom(body as BlockAction);
      const b = body as BlockAction;
      const auth = await requireLinkedUser(respond, b.team?.id ?? "", b.user.id);
      if (!auth) return;

      const result = await argusApi.createOutcome(
        { apiKey: auth.apiKey, actingUserId: auth.argusUserId },
        { decisionId, type: outcomeType },
      );
      await cancelOutcomeNudges(decisionId);

      await respond({
        response_type: "ephemeral",
        text: `Outcome logged! This decision is now training ARGUS. ${result.patternUpdated}`,
      });
    });
  }
}
