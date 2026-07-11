import { describe, expect, it, vi, beforeEach } from "vitest";
import { decrypt } from "../../lib/encryption.js";

const prisma = {
  apiKey: { create: vi.fn() },
  integration: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
};
vi.mock("@argus/database", () => ({ prisma }));

const { connectSlackIntegration } = await import("./integration.repository.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("connectSlackIntegration — Bible §18 INF-4 encryption at rest", () => {
  const input = {
    slackTeamId: "T123",
    botToken: "xoxb-real-slack-token",
    botUserId: "U_BOT",
    alertChannelId: "C_ALERTS",
  };

  it("stores botToken/apiKey as ciphertext, not plaintext, on first connect", async () => {
    prisma.integration.findFirst.mockResolvedValue(null);

    await connectSlackIntegration("team_1", input);

    expect(prisma.integration.create).toHaveBeenCalledTimes(1);
    const { config } = prisma.integration.create.mock.calls[0]![0].data as {
      config: { botToken: string; apiKey: string; slackTeamId: string };
    };

    expect(config.botToken).not.toBe(input.botToken);
    expect(config.apiKey).not.toContain("argus_slack_");
    expect(decrypt(config.botToken)).toBe(input.botToken);
    expect(decrypt(config.apiKey)).toMatch(/^argus_slack_/);
    // slackTeamId stays plaintext -- findSlackIntegrationBySlackTeamId does
    // a Prisma JSON-path match on it, which ciphertext can't support.
    expect(config.slackTeamId).toBe("T123");
  });

  it("also encrypts on an update (re-connecting an already-integrated team)", async () => {
    prisma.integration.findFirst.mockResolvedValue({ id: "int_1" });

    await connectSlackIntegration("team_1", input);

    expect(prisma.integration.update).toHaveBeenCalledTimes(1);
    const { config } = prisma.integration.update.mock.calls[0]![0].data as {
      config: { botToken: string };
    };
    expect(decrypt(config.botToken)).toBe(input.botToken);
  });

  it("still returns the raw (unencrypted) API key to the caller — shown once at connect time", async () => {
    prisma.integration.findFirst.mockResolvedValue(null);

    const apiKey = await connectSlackIntegration("team_1", input);

    expect(apiKey).toMatch(/^argus_slack_[0-9a-f]{48}$/);
  });
});
