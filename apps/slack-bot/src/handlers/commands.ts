import type { App } from "@slack/bolt";
import { resolveTeam } from "../lib/team-resolver.js";
import { resolveUser } from "../lib/user-resolver.js";
import { argusApi, integrationsApi } from "../lib/api-client.js";
import { buildQueueBlocks } from "../blocks/queue-list.js";
import { withErrorFeedback } from "../lib/error-feedback.js";

// Bible §18 SLK-1 "Command handlers (/argus, /argus-queue)".
export function registerCommandHandlers(app: App): void {
  app.command("/argus", async ({ command, ack, respond, client }) => {
    await ack();

    const subcommand = command.text.trim().split(/\s+/)[0]?.toLowerCase();

    if (subcommand === "link") {
      const teamId = command.team_id;
      const userId = command.user_id;
      const info = await client.users.info({ user: userId });
      const email = info.user?.profile?.email;

      if (!email) {
        await respond({
          response_type: "ephemeral",
          text: "I couldn't read your Slack email (needs the `users:read.email` scope). Ask an admin to grant it.",
        });
        return;
      }

      try {
        await integrationsApi.linkUser({ slackTeamId: teamId, slackUserId: userId, email });
        await respond({ response_type: "ephemeral", text: `Linked! You're connected as ${email}.` });
      } catch (err) {
        await respond({
          response_type: "ephemeral",
          text: `Couldn't link your account: ${err instanceof Error ? err.message : "unknown error"}`,
        });
      }
      return;
    }

    await respond({
      response_type: "ephemeral",
      text: [
        "*ARGUS AI*",
        "`/argus link` — connect your Slack account to ARGUS (run this first)",
        "`/argus-queue` — view Today's Queue",
      ].join("\n"),
    });
  });

  app.command("/argus-queue", async ({ command, ack, respond }) => {
    await ack();

    const teamId = command.team_id;
    const slackUserId = command.user_id;

    await withErrorFeedback(respond, "/argus-queue", async () => {
      const [team, argusUserId] = await Promise.all([
        resolveTeam(teamId),
        resolveUser(teamId, slackUserId),
      ]);

      if (!argusUserId) {
        await respond({
          response_type: "ephemeral",
          text: "Run `/argus link` first so I know which ARGUS account you are.",
        });
        return;
      }

      const queue = await argusApi.getQueue({ apiKey: team.apiKey, actingUserId: argusUserId });
      await respond({ response_type: "ephemeral", blocks: buildQueueBlocks(queue) });
    });
  });
}
