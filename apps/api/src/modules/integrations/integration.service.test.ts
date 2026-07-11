import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ConnectSlackRequest } from "@argus/shared";
import type { AuthContext } from "../../middleware/auth.js";

const repo = {
  connectSlackIntegration: vi.fn(),
  findSlackIntegrationBySlackTeamId: vi.fn(),
  findSlackIntegrationByTeamId: vi.fn(),
  findUserBySlackId: vi.fn(),
  linkSlackUser: vi.fn(),
  linkSlackUserById: vi.fn(),
  findUserByEmailInTeam: vi.fn(),
};
vi.mock("./integration.repository.js", () => repo);

const track = vi.fn();
vi.mock("../../lib/analytics.js", () => ({ track }));

const oauthClient = {
  buildAuthorizeUrl: vi.fn(),
  exchangeCodeForToken: vi.fn(),
};
vi.mock("./slack-oauth.client.js", () => oauthClient);

const oauthState = {
  createOAuthState: vi.fn(),
  consumeOAuthState: vi.fn(),
};
vi.mock("./oauth-state.js", () => oauthState);

const recordAudit = vi.fn();
vi.mock("../../lib/audit.js", () => ({ recordAudit }));

const {
  connectSlack,
  resolveSlackTeam,
  linkSlackUser,
  resolveSlackUser,
  initiateSlackOAuth,
  completeSlackOAuth,
} = await import("./integration.service.js");

const connectRequest: ConnectSlackRequest = {
  slackTeamId: "T123",
  botToken: "xoxb-fake",
  botUserId: "U_BOT",
  alertChannelId: "C_ALERTS",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("connectSlack", () => {
  it("rejects non-admin roles with FORBIDDEN", async () => {
    const auth: AuthContext = { type: "user", userId: "u1", role: "SDR", teamId: "team_1", planTier: "PRO" };
    await expect(connectSlack(connectRequest, auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.connectSlackIntegration).not.toHaveBeenCalled();
  });

  it("allows a MANAGER to connect Slack and returns the raw API key", async () => {
    const auth: AuthContext = { type: "user", userId: "u1", role: "MANAGER", teamId: "team_1", planTier: "PRO" };
    repo.connectSlackIntegration.mockResolvedValue("argus_slack_rawkey123");

    const result = await connectSlack(connectRequest, auth);

    expect(result).toEqual({ teamId: "team_1", apiKey: "argus_slack_rawkey123" });
    expect(repo.connectSlackIntegration).toHaveBeenCalledWith("team_1", connectRequest);
    expect(track).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        name: "integration_connected",
        properties: expect.objectContaining({ provider: "slack", auth_method: "manual_token" }),
      }),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "integration",
        entityId: "team_1",
        action: "connected",
        actorId: "u1",
      }),
    );
  });
});

describe("resolveSlackTeam", () => {
  it("throws NOT_FOUND when no integration matches the Slack workspace", async () => {
    repo.findSlackIntegrationBySlackTeamId.mockResolvedValue(null);
    await expect(resolveSlackTeam("T_unknown")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns the resolved config", async () => {
    repo.findSlackIntegrationBySlackTeamId.mockResolvedValue({
      teamId: "team_1",
      config: {
        slackTeamId: "T123",
        botUserId: "U_BOT",
        alertChannelId: "C_ALERTS",
        botToken: "xoxb-fake",
        apiKey: "argus_slack_rawkey123",
      },
    });

    const result = await resolveSlackTeam("T123");
    expect(result).toEqual({
      argusTeamId: "team_1",
      apiKey: "argus_slack_rawkey123",
      botToken: "xoxb-fake",
      botUserId: "U_BOT",
      alertChannelId: "C_ALERTS",
    });
  });
});

describe("linkSlackUser", () => {
  it("throws NOT_FOUND when the email doesn't match a user on the connected team", async () => {
    repo.findSlackIntegrationBySlackTeamId.mockResolvedValue({
      teamId: "team_1",
      config: { slackTeamId: "T123", botUserId: "U_BOT", alertChannelId: "C", botToken: "x", apiKey: "k" },
    });
    repo.findUserByEmailInTeam.mockResolvedValue(null);

    await expect(
      linkSlackUser({ slackTeamId: "T123", slackUserId: "U_REP", email: "nobody@example.com" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repo.linkSlackUser).not.toHaveBeenCalled();
  });

  it("links the Slack user to the matching ARGUS user", async () => {
    repo.findSlackIntegrationBySlackTeamId.mockResolvedValue({
      teamId: "team_1",
      config: { slackTeamId: "T123", botUserId: "U_BOT", alertChannelId: "C", botToken: "x", apiKey: "k" },
    });
    repo.findUserByEmailInTeam.mockResolvedValue({ id: "user_1", email: "alex@example.com" });
    repo.linkSlackUser.mockResolvedValue({ id: "user_1", teamId: "team_1" });

    const result = await linkSlackUser({ slackTeamId: "T123", slackUserId: "U_REP", email: "alex@example.com" });

    expect(result).toEqual({ userId: "user_1", teamId: "team_1" });
    expect(repo.linkSlackUser).toHaveBeenCalledWith("team_1", "U_REP", "alex@example.com");
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "user",
        entityId: "user_1",
        action: "slack_linked",
      }),
    );
  });
});

describe("resolveSlackUser", () => {
  it("returns null userId when no user is linked yet", async () => {
    repo.findSlackIntegrationBySlackTeamId.mockResolvedValue({
      teamId: "team_1",
      config: { slackTeamId: "T123", botUserId: "U_BOT", alertChannelId: "C", botToken: "x", apiKey: "k" },
    });
    repo.findUserBySlackId.mockResolvedValue(null);

    const result = await resolveSlackUser("T123", "U_UNLINKED");
    expect(result).toEqual({ userId: null });
  });

  it("returns the linked userId", async () => {
    repo.findSlackIntegrationBySlackTeamId.mockResolvedValue({
      teamId: "team_1",
      config: { slackTeamId: "T123", botUserId: "U_BOT", alertChannelId: "C", botToken: "x", apiKey: "k" },
    });
    repo.findUserBySlackId.mockResolvedValue({ id: "user_1" });

    const result = await resolveSlackUser("T123", "U_REP");
    expect(result).toEqual({ userId: "user_1" });
  });
});

describe("initiateSlackOAuth", () => {
  it("rejects non-admin roles with FORBIDDEN", async () => {
    const auth: AuthContext = { type: "user", userId: "u1", role: "SDR", teamId: "team_1", planTier: "PRO" };
    await expect(initiateSlackOAuth(auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(oauthState.createOAuthState).not.toHaveBeenCalled();
  });

  it("rejects API-key auth with no user attached", async () => {
    const auth: AuthContext = { type: "api_key", role: "ADMIN", teamId: "team_1", planTier: "PRO" };
    await expect(initiateSlackOAuth(auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("creates a state token scoped to the admin's team+user and returns the authorize URL", async () => {
    const auth: AuthContext = { type: "user", userId: "u1", role: "ADMIN", teamId: "team_1", planTier: "PRO" };
    oauthState.createOAuthState.mockResolvedValue("random_state_token");
    oauthClient.buildAuthorizeUrl.mockReturnValue("https://slack.com/oauth/v2/authorize?state=random_state_token");

    const url = await initiateSlackOAuth(auth);

    expect(oauthState.createOAuthState).toHaveBeenCalledWith({ teamId: "team_1", userId: "u1" });
    expect(oauthClient.buildAuthorizeUrl).toHaveBeenCalledWith("random_state_token");
    expect(url).toBe("https://slack.com/oauth/v2/authorize?state=random_state_token");
  });
});

describe("completeSlackOAuth", () => {
  it("redirects to the error page when Slack reports a consent error, without touching state", async () => {
    const url = await completeSlackOAuth({ error: "access_denied" });
    expect(url).toContain("/queue?slack=error");
    expect(oauthState.consumeOAuthState).not.toHaveBeenCalled();
  });

  it("redirects to the error page when code or state is missing", async () => {
    const url = await completeSlackOAuth({ code: "abc" });
    expect(url).toContain("/queue?slack=error");
  });

  it("redirects to the error page when state is invalid, expired, or already used", async () => {
    oauthState.consumeOAuthState.mockResolvedValue(null);
    const url = await completeSlackOAuth({ code: "abc", state: "bad_state" });
    expect(url).toContain("/queue?slack=error");
    expect(repo.connectSlackIntegration).not.toHaveBeenCalled();
  });

  it("redirects to the error page when the Slack code exchange fails", async () => {
    oauthState.consumeOAuthState.mockResolvedValue({ teamId: "team_1", userId: "u1" });
    oauthClient.exchangeCodeForToken.mockRejectedValue(new Error("invalid_code"));

    const url = await completeSlackOAuth({ code: "bad_code", state: "s1" });

    expect(url).toContain("/queue?slack=error");
    expect(repo.connectSlackIntegration).not.toHaveBeenCalled();
  });

  it("persists the integration, links the installing admin, tracks the event, and redirects to success", async () => {
    oauthState.consumeOAuthState.mockResolvedValue({ teamId: "team_1", userId: "u1" });
    oauthClient.exchangeCodeForToken.mockResolvedValue({
      slackTeamId: "T123",
      slackTeamName: "Acme Corp",
      botToken: "xoxb-real",
      botUserId: "U_BOT",
      alertChannelId: "C_ALERTS",
      installingSlackUserId: "U_ADMIN",
    });
    repo.connectSlackIntegration.mockResolvedValue("argus_slack_rawkey123");
    repo.linkSlackUserById.mockResolvedValue({ id: "u1", teamId: "team_1" });

    const url = await completeSlackOAuth({ code: "good_code", state: "s1" });

    expect(repo.connectSlackIntegration).toHaveBeenCalledWith("team_1", {
      slackTeamId: "T123",
      botToken: "xoxb-real",
      botUserId: "U_BOT",
      alertChannelId: "C_ALERTS",
    });
    expect(repo.linkSlackUserById).toHaveBeenCalledWith("u1", "U_ADMIN");
    expect(track).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        name: "integration_connected",
        properties: expect.objectContaining({ provider: "slack", auth_method: "oauth" }),
      }),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "integration", entityId: "team_1", action: "connected", actorId: "u1" }),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "user", entityId: "u1", action: "slack_linked", actorId: "u1" }),
    );
    expect(url).toContain("/queue?slack=connected");
  });
});
