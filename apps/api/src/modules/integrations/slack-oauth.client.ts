import { env } from "../../config/env.js";

// Bible §18 SLK-1 "Add to Slack" (P0). Verified against Slack's own current
// docs (docs.slack.dev/authentication/installing-with-oauth and
// docs.slack.dev/messaging/sending-messages-using-incoming-webhooks) rather
// than assumed: the authorize URL, the oauth.v2.access token-exchange shape,
// and the incoming_webhook.channel_id field used below to let the installing
// admin pick the alerts channel on Slack's own consent screen instead of
// pasting a channel ID by hand.
const SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access";

// Minimal scopes for what apps/slack-bot actually calls (see
// handlers/commands.ts, handlers/actions.ts, jobs/nudges.ts,
// lib/team-alerts.ts): chat.postMessage, users.info (email lookup for
// `/argus link`), and slash commands. incoming-webhook is requested purely
// for its consent-screen channel picker — the returned webhook URL itself is
// unused, since chat.postMessage over the bot token already works for a
// channel a workspace admin selected via that picker.
const BOT_SCOPES = "commands,chat:write,users:read,users:read.email,incoming-webhook";

export function getOAuthRedirectUri(): string {
  return `${env.PUBLIC_API_URL}/api/v1/integrations/slack/oauth/callback`;
}

export function buildAuthorizeUrl(state: string): string {
  if (!env.SLACK_CLIENT_ID) {
    throw new Error("SLACK_CLIENT_ID is not configured");
  }
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: BOT_SCOPES,
    redirect_uri: getOAuthRedirectUri(),
    state,
  });
  return `${SLACK_AUTHORIZE_URL}?${params.toString()}`;
}

export interface SlackOAuthResult {
  slackTeamId: string;
  slackTeamName: string;
  botToken: string;
  botUserId: string;
  alertChannelId: string;
  installingSlackUserId: string;
}

interface SlackOAuthAccessResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  bot_user_id?: string;
  team?: { id?: string; name?: string };
  authed_user?: { id?: string };
  incoming_webhook?: { channel_id?: string };
}

/** Throws with Slack's own `error` string (e.g. "invalid_code",
 *  "code_already_used") on failure — the caller decides how to surface it. */
export async function exchangeCodeForToken(code: string): Promise<SlackOAuthResult> {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    throw new Error("Slack OAuth is not configured");
  }

  const response = await fetch(SLACK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: getOAuthRedirectUri(),
    }),
  });

  const body = (await response.json()) as SlackOAuthAccessResponse;

  if (!response.ok || !body.ok) {
    throw new Error(body.error ?? `Slack OAuth token exchange failed with status ${response.status}`);
  }
  if (
    !body.access_token ||
    !body.bot_user_id ||
    !body.team?.id ||
    !body.authed_user?.id ||
    !body.incoming_webhook?.channel_id
  ) {
    throw new Error("Slack OAuth response is missing required fields");
  }

  return {
    slackTeamId: body.team.id,
    slackTeamName: body.team.name ?? body.team.id,
    botToken: body.access_token,
    botUserId: body.bot_user_id,
    alertChannelId: body.incoming_webhook.channel_id,
    installingSlackUserId: body.authed_user.id,
  };
}
