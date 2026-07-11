import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@argus/database";
import { encrypt } from "../../lib/encryption.js";

export interface SlackIntegrationConfig {
  slackTeamId: string;
  botUserId: string;
  alertChannelId: string;
  // AES-256-GCM ciphertext (Bible §18 INF-4 "Data encryption at rest"), not
  // the raw values — see lib/encryption.ts. slackTeamId/botUserId/
  // alertChannelId stay plaintext: they aren't credentials, and
  // slackTeamId specifically must stay queryable (findSlackIntegration
  // BySlackTeamId below does a Prisma JSON-path match on it, which an
  // encrypted blob can't support). Decrypted back to plain strings in
  // integration.service.ts's toResolution(), the one place the raw config
  // is reshaped into what the rest of the app consumes.
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
    botToken: encrypt(input.botToken),
    apiKey: encrypt(apiKey),
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

/** Used by the OAuth install flow (Bible §18 SLK-1), where the installing
 *  admin's ARGUS userId is already known from the signed state param — unlike
 *  linkSlackUser's email lookup, which is for other team members running
 *  `/argus link` from a Slack DM where only their email is available. */
export function linkSlackUserById(userId: string, slackUserId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { slackUserId },
    select: { id: true, teamId: true },
  });
}
