// Bible §6.5 Full Debate View's "[Share with Team]" button. apps/slack-bot
// already depends on @slack/web-api for its own richer Block Kit needs;
// apps/api posts exactly one kind of message (a plain-text share), so a
// direct call to Slack's chat.postMessage REST endpoint avoids adding that
// whole SDK here for one call -- the same reasoning apollo-client.ts/
// clearbit-client.ts already use plain `fetch` over an SDK for their own
// single-endpoint needs.
const SLACK_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage";

export async function postSlackMessage(
  botToken: string,
  channel: string,
  text: string,
): Promise<void> {
  const response = await fetch(SLACK_POST_MESSAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, text }),
  });

  if (!response.ok) {
    throw new Error(`Slack chat.postMessage failed with HTTP status ${response.status}`);
  }

  // Most application-level Slack API errors (bad channel, bad token) still
  // return HTTP 200 -- the real signal is the response body's own `ok`
  // boolean. Rate limiting is the one documented exception (a genuine HTTP
  // 429, caught by response.ok above) -- verified against Slack's own docs
  // rather than assumed.
  const body = (await response.json()) as { ok: boolean; error?: string };
  if (!body.ok) {
    throw new Error(`Slack chat.postMessage failed: ${body.error ?? "unknown error"}`);
  }
}
