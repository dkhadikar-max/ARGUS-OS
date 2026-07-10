import { AppError, type ConnectSlackRequest, type ConnectSlackResponse, type LinkSlackUserRequest, type LinkSlackUserResponse, type SlackTeamResolution, type SlackUserResolution } from "@argus/shared";
import type { AuthContext } from "../../middleware/auth.js";
import {
  connectSlackIntegration,
  findSlackIntegrationByTeamId,
  findSlackIntegrationBySlackTeamId,
  findUserByEmailInTeam,
  findUserBySlackId,
  linkSlackUser as linkSlackUserRecord,
} from "./integration.repository.js";
import type { SlackIntegrationConfig } from "./integration.repository.js";

const ADMIN_ROLES = new Set(["ADMIN", "FOUNDER", "MANAGER"]);

function toResolution(integration: { teamId: string; config: unknown }): SlackTeamResolution {
  const config = integration.config as SlackIntegrationConfig;
  return {
    argusTeamId: integration.teamId,
    apiKey: config.apiKey,
    botToken: config.botToken,
    botUserId: config.botUserId,
    alertChannelId: config.alertChannelId,
  };
}

export async function connectSlack(
  request: ConnectSlackRequest,
  auth: AuthContext,
): Promise<ConnectSlackResponse> {
  if (!auth.role || !ADMIN_ROLES.has(auth.role)) {
    throw new AppError("FORBIDDEN", "Only a team admin can connect Slack");
  }

  const apiKey = await connectSlackIntegration(auth.teamId, request);
  return { teamId: auth.teamId, apiKey };
}

export async function resolveSlackTeam(slackTeamId: string): Promise<SlackTeamResolution> {
  const integration = await findSlackIntegrationBySlackTeamId(slackTeamId);
  if (!integration) {
    throw new AppError("NOT_FOUND", "No ARGUS team is connected to this Slack workspace");
  }
  return toResolution(integration);
}

/** Reverse of resolveSlackTeam — used when apps/api itself needs to alert
 *  Slack about an ARGUS-side event (Bible §9.2 channel:team:{teamId} pub/sub
 *  consumed by the Slack Bot's decision.created listener). */
export async function resolveSlackTeamByArgusTeamId(
  teamId: string,
): Promise<SlackTeamResolution | null> {
  const integration = await findSlackIntegrationByTeamId(teamId);
  if (!integration) return null;
  return toResolution(integration);
}

export async function linkSlackUser(
  request: LinkSlackUserRequest,
): Promise<LinkSlackUserResponse> {
  const resolution = await resolveSlackTeam(request.slackTeamId);
  const user = await findUserByEmailInTeam(resolution.argusTeamId, request.email);
  if (!user) {
    throw new AppError(
      "NOT_FOUND",
      "No ARGUS account with this email exists on the connected team",
    );
  }

  const updated = await linkSlackUserRecord(resolution.argusTeamId, request.slackUserId, request.email);
  return { userId: updated.id, teamId: updated.teamId ?? resolution.argusTeamId };
}

export async function resolveSlackUser(
  slackTeamId: string,
  slackUserId: string,
): Promise<SlackUserResolution> {
  const resolution = await resolveSlackTeam(slackTeamId);
  const user = await findUserBySlackId(resolution.argusTeamId, slackUserId);
  return { userId: user?.id ?? null };
}
