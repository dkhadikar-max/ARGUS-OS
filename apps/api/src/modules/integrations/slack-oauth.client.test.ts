import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("buildAuthorizeUrl", () => {
  it("throws when SLACK_CLIENT_ID is unset", async () => {
    vi.doMock("../../config/env.js", () => ({
      env: { SLACK_CLIENT_ID: undefined, PUBLIC_API_URL: "http://localhost:4000" },
    }));
    const { buildAuthorizeUrl } = await import("./slack-oauth.client.js");
    expect(() => buildAuthorizeUrl("state123")).toThrow(/SLACK_CLIENT_ID/);
  });

  it("builds the verified Slack v2 authorize URL with minimal bot scopes", async () => {
    vi.doMock("../../config/env.js", () => ({
      env: { SLACK_CLIENT_ID: "client123", PUBLIC_API_URL: "http://localhost:4000" },
    }));
    const { buildAuthorizeUrl } = await import("./slack-oauth.client.js");

    const url = new URL(buildAuthorizeUrl("state123"));

    expect(url.origin + url.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(url.searchParams.get("client_id")).toBe("client123");
    expect(url.searchParams.get("state")).toBe("state123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:4000/api/v1/integrations/slack/oauth/callback",
    );
    expect(url.searchParams.get("scope")).toBe(
      "commands,chat:write,users:read,users:read.email,incoming-webhook",
    );
  });
});

describe("exchangeCodeForToken", () => {
  it("throws when Slack OAuth credentials are unset, without making a request", async () => {
    vi.doMock("../../config/env.js", () => ({
      env: { SLACK_CLIENT_ID: undefined, SLACK_CLIENT_SECRET: undefined, PUBLIC_API_URL: "http://localhost:4000" },
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { exchangeCodeForToken } = await import("./slack-oauth.client.js");
    await expect(exchangeCodeForToken("code123")).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("when configured", () => {
    beforeEach(() => {
      vi.doMock("../../config/env.js", () => ({
        env: {
          SLACK_CLIENT_ID: "client123",
          SLACK_CLIENT_SECRET: "secret123",
          PUBLIC_API_URL: "http://localhost:4000",
        },
      }));
    });

    it("posts the verified oauth.v2.access request and parses a successful response", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          access_token: "xoxb-real",
          bot_user_id: "U_BOT",
          team: { id: "T123", name: "Acme Corp" },
          authed_user: { id: "U_ADMIN" },
          incoming_webhook: { channel_id: "C_ALERTS" },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const { exchangeCodeForToken } = await import("./slack-oauth.client.js");
      const result = await exchangeCodeForToken("code123");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://slack.com/api/oauth.v2.access",
        expect.objectContaining({ method: "POST" }),
      );
      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const sentBody = new URLSearchParams(options.body as string);
      expect(sentBody.get("client_id")).toBe("client123");
      expect(sentBody.get("client_secret")).toBe("secret123");
      expect(sentBody.get("code")).toBe("code123");

      expect(result).toEqual({
        slackTeamId: "T123",
        slackTeamName: "Acme Corp",
        botToken: "xoxb-real",
        botUserId: "U_BOT",
        alertChannelId: "C_ALERTS",
        installingSlackUserId: "U_ADMIN",
      });
    });

    it("throws Slack's own error string on a failed exchange", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, error: "invalid_code" }) }),
      );
      const { exchangeCodeForToken } = await import("./slack-oauth.client.js");
      await expect(exchangeCodeForToken("bad_code")).rejects.toThrow(/invalid_code/);
    });

    it("throws when the response is missing a required field (e.g. no channel picked)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            ok: true,
            access_token: "xoxb-real",
            bot_user_id: "U_BOT",
            team: { id: "T123" },
            authed_user: { id: "U_ADMIN" },
            // incoming_webhook omitted
          }),
        }),
      );
      const { exchangeCodeForToken } = await import("./slack-oauth.client.js");
      await expect(exchangeCodeForToken("code123")).rejects.toThrow(/missing required fields/);
    });
  });
});
