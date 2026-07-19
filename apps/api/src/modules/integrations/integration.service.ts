import { AppError, type ConnectSlackRequest, type ConnectSlackResponse, type LinkSlackUserRequest, type LinkSlackUserResponse, type SlackIntegrationStatusResponse, type SlackTeamResolution, type SlackUserResolution } from "@argus/shared";
import { ADMIN_ROLES, type AuthContext } from "../../middleware/auth.js";
import {
  connectSlackIntegration,
  findSlackIntegrationByTeamId,
  findSlackIntegrationBySlackTeamId,
  findUserByEmailInTeam,
  findUserBySlackId,
  linkSlackUser as linkSlackUserRecord,
  linkSlackUserById,
} from "./integration.repository.js";
import type { SlackIntegrationConfig } from "./integration.repository.js";
import { track } from "../../lib/analytics.js";
import { buildAuthorizeUrl, exchangeCodeForToken } from "./slack-oauth.client.js";
import { consumeOAuthState, createOAuthState } from "./oauth-state.js";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { recordAudit, type RequestMeta } from "../../lib/audit.js";
import { decrypt } from "../../lib/encryption.js";

// Bible §18 INF-4: config.botToken/apiKey are AES-256-GCM ciphertext at
// rest (integration.repository.ts encrypts them on write) — this is the one
// place the raw config is reshaped into what the rest of the app consumes,
// so it's also the one place that needs to decrypt them back.
function toResolution(integration: { teamId: string; config: unknown }): SlackTeamResolution {
  const config = integration.config as SlackIntegrationConfig;
  return {
    argusTeamId: integration.teamId,
    apiKey: decrypt(config.apiKey),
    botToken: decrypt(config.botToken),
    botUserId: config.botUserId,
    alertChannelId: config.alertChannelId,
  };
}

export async function connectSlack(
  request: ConnectSlackRequest,
  auth: AuthContext,
  meta?: RequestMeta,
): Promise<ConnectSlackResponse> {
  if (!auth.role || !ADMIN_ROLES.has(auth.role)) {
    throw new AppError("FORBIDDEN", "Only a team admin can connect Slack");
  }

  const startedAt = Date.now();
  const apiKey = await connectSlackIntegration(auth.teamId, request);

  // Bible §19.1 Data Integrity: "Audit logs capture all state changes" —
  // connecting Slack hands a bot token + generated API key to a third
  // party, exactly the kind of sensitive state change this is for.
  await recordAudit({
    entityType: "integration",
    entityId: auth.teamId,
    action: "connected",
    actorId: auth.userId ?? "system",
    afterState: { provider: "slack", authMethod: "manual_token", slackTeamId: request.slackTeamId },
    meta,
  });

  if (auth.userId) {
    // Bible §11.1 integration_connected: "time_to_connect_ms" is meant for
    // an OAuth redirect-to-callback duration — this is the manual-token
    // fallback path (see completeSlackOAuth below for the real OAuth
    // timing), so this measures the actual connect-request latency instead;
    // an honest (if differently-scoped) value rather than a made-up one.
    track(auth.userId, {
      name: "integration_connected",
      properties: {
        provider: "slack",
        auth_method: "manual_token",
        time_to_connect_ms: Date.now() - startedAt,
      },
    });
  }

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
  meta?: RequestMeta,
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

  await recordAudit({
    entityType: "user",
    entityId: updated.id,
    action: "slack_linked",
    actorId: updated.id,
    afterState: { slackUserId: request.slackUserId },
    meta,
  });

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

/** Not in the Bible -- backs the Queue page's "Connect Slack" button so it
 *  can show connected state instead of always rendering as if nothing were
 *  connected. Any team member can check (not admin-gated, unlike connect/
 *  install below), since it's read-only. */
export async function getSlackIntegrationStatus(
  auth: AuthContext,
): Promise<SlackIntegrationStatusResponse> {
  const integration = await findSlackIntegrationByTeamId(auth.teamId);
  return { connected: integration?.status === "CONNECTED" };
}

/** Bible §18 SLK-1 — step 1 of the self-serve "Add to Slack" flow: an
 *  authenticated admin hits GET /slack/install, which redirects their browser
 *  to Slack's own consent screen. */
export async function initiateSlackOAuth(auth: AuthContext): Promise<string> {
  if (!auth.role || !ADMIN_ROLES.has(auth.role)) {
    throw new AppError("FORBIDDEN", "Only a team admin can connect Slack");
  }
  if (!auth.userId) {
    throw new AppError("FORBIDDEN", "A user-scoped session is required to connect Slack");
  }

  const state = await createOAuthState({ teamId: auth.teamId, userId: auth.userId });
  return buildAuthorizeUrl(state);
}

/** Step 2: Slack redirects the browser back here with `code`+`state` (or an
 *  `error`, e.g. if the admin clicked "Cancel"). Never throws for expected
 *  failure paths — always returns a dashboard redirect URL, since this is a
 *  browser-facing flow, not a JSON API a caller can catch. Genuinely
 *  unexpected errors (DB down, etc.) still throw and become a 500. */
export async function completeSlackOAuth(
  params: { code?: string; state?: string; error?: string },
  meta?: RequestMeta,
): Promise<string> {
  const failureUrl = `${env.DASHBOARD_URL}/queue?slack=error`;

  if (params.error) {
    logger.info({ slackOAuthError: params.error }, "Slack OAuth consent denied or errored");
    return failureUrl;
  }
  if (!params.code || !params.state) {
    return failureUrl;
  }

  const stateData = await consumeOAuthState(params.state);
  if (!stateData) {
    logger.warn("Slack OAuth callback with invalid/expired/reused state");
    return failureUrl;
  }

  let oauthResult;
  try {
    oauthResult = await exchangeCodeForToken(params.code);
  } catch (err) {
    logger.error({ err }, "Slack OAuth code exchange failed");
    return failureUrl;
  }

  const startedAt = Date.now();
  await connectSlackIntegration(stateData.teamId, {
    slackTeamId: oauthResult.slackTeamId,
    botToken: oauthResult.botToken,
    botUserId: oauthResult.botUserId,
    alertChannelId: oauthResult.alertChannelId,
  });

  await recordAudit({
    entityType: "integration",
    entityId: stateData.teamId,
    action: "connected",
    actorId: stateData.userId,
    afterState: { provider: "slack", authMethod: "oauth", slackTeamId: oauthResult.slackTeamId },
    meta,
  });

  // The installing admin already has a Slack identity from the OAuth
  // response itself — no need to make them separately run `/argus link`.
  await linkSlackUserById(stateData.userId, oauthResult.installingSlackUserId);

  await recordAudit({
    entityType: "user",
    entityId: stateData.userId,
    action: "slack_linked",
    actorId: stateData.userId,
    afterState: { slackUserId: oauthResult.installingSlackUserId },
    meta,
  });

  track(stateData.userId, {
    name: "integration_connected",
    properties: {
      provider: "slack",
      auth_method: "oauth",
      time_to_connect_ms: Date.now() - startedAt,
    },
  });

  return `${env.DASHBOARD_URL}/queue?slack=connected`;
}
