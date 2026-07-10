import { App, type AuthorizeResult } from "@slack/bolt";
import { env } from "./config/env.js";
import { resolveTeam } from "./lib/team-resolver.js";
import { registerCommandHandlers } from "./handlers/commands.js";
import { registerActionHandlers } from "./handlers/actions.js";

/**
 * Bible §7.2 "Socket Mode avoids public URL requirement" + §18 Epic 3: one
 * bot process serves every connected ARGUS team, so `authorize` resolves
 * the right workspace's bot token per incoming event instead of a single
 * static token (Bolt's built-in multi-workspace mechanism).
 */
export function createSlackApp(): App {
  const app = new App({
    socketMode: true,
    appToken: env.SLACK_APP_TOKEN,
    signingSecret: env.SLACK_SIGNING_SECRET,
    authorize: async (source): Promise<AuthorizeResult> => {
      const slackTeamId = source.teamId;
      if (!slackTeamId) {
        throw new Error("Slack request had no teamId to authorize against");
      }
      const team = await resolveTeam(slackTeamId);
      return {
        botToken: team.botToken,
        botUserId: team.botUserId,
        teamId: slackTeamId,
      };
    },
  });

  registerCommandHandlers(app);
  registerActionHandlers(app);

  return app;
}
