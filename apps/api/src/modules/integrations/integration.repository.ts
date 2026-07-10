import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@argus/database";

export interface SlackIntegrationConfig {
  slackTeamId: string;
  botUserId: string;
  alertChannelId: string;
  // Plaintext bot token + API key, retrievable by the Slack Bot process at
  // runtime. Bible §18 INF-4 ("Data encryption at rest") is an explicit,
  // not-yet-built P1 backlog item — until it lands, this column holds these
  // secrets unencrypted, same as any other JSON field in this schema. Flagging
  // this here rather than silently shipping it is the honest tradeoff.
  botToken: string;
  apiKey: string;
}

function generateApiKey(): string {
  return `argus_slack_${randomBytes(24).toString("hex")}`;
}

export function findSlackIntegrationBySlackTeamId(slackTeamId: string) {
  return prisma.integration.findFirst({
    where: { provider: "slack", config: { path: ["slackTeamId"], equals: slackTeamId } },
  });
}

export function findSlackIntegrationByTeamId(teamId: string) {
  return prisma.integration.findFirst({ where: { provider: "slack", teamId } });
}

export async function connectSlackIntegration(
  teamId: string,
  input: { slackTeamId: string; botToken: string; botUserId: string; alertChannelId: string },
) {
  const apiKey = generateApiKey();
  const keyHash = createHash("sha256").update(apiKey).digest("hex");

  await prisma.apiKey.create({
    data: { teamId, keyHash, name: "Slack Bot (auto-generated)" },
  });

  const config: SlackIntegrationConfig = {
    slackTeamId: input.slackTeamId,
    botUserId: input.botUserId,
    alertChannelId: input.alertChannelId,
    botToken: input.botToken,
    apiKey,
  };

  const existing = await findSlackIntegrationByTeamId(teamId);
  if (existing) {
    await prisma.integration.update({
      where: { id: existing.id },
      data: { status: "CONNECTED", config: config as never, lastSyncAt: new Date() },
    });
  } else {
    await prisma.integration.create({
      data: { teamId, provider: "slack", status: "CONNECTED", config: config as never, lastSyncAt: new Date() },
    });
  }

  return apiKey;
}

export function findUserBySlackId(teamId: string, slackUserId: string) {
  return prisma.user.findFirst({ where: { teamId, slackUserId } });
}

export async function linkSlackUser(teamId: string, slackUserId: string, email: string) {
  return prisma.user.update({
    where: { email },
    data: { slackUserId },
    select: { id: true, teamId: true },
  });
}

export function findUserByEmailInTeam(teamId: string, email: string) {
  return prisma.user.findFirst({ where: { teamId, email } });
}
