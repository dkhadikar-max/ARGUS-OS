import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ConnectSlackRequest } from "@argus/shared";
import type { AuthContext } from "../../middleware/auth.js";

const repo = {
  connectSlackIntegration: vi.fn(),
  findSlackIntegrationBySlackTeamId: vi.fn(),
  findSlackIntegrationByTeamId: vi.fn(),
  findUserBySlackId: vi.fn(),
  linkSlackUser: vi.fn(),
  findUserByEmailInTeam: vi.fn(),
};
vi.mock("./integration.repository.js", () => repo);

const track = vi.fn();
vi.mock("../../lib/analytics.js", () => ({ track }));

const { connectSlack, resolveSlackTeam, linkSlackUser, resolveSlackUser } = await import(
  "./integration.service.js"
);

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
