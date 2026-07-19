import { Router } from "express";
import { connectSlackRequestSchema, linkSlackUserRequestSchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireInternalService } from "../../middleware/internal-auth.js";
import { validate } from "../../middleware/validate.js";
import {
  connectSlackHandler,
  installSlackHandler,
  linkSlackUserHandler,
  resolveSlackTeamByArgusTeamHandler,
  resolveSlackTeamHandler,
  resolveSlackUserHandler,
  slackOAuthCallbackHandler,
  slackStatusHandler,
} from "./integration.controller.js";

export const integrationRouter = Router();

// End-user-facing: a team admin connects their Slack workspace (Bible §18 Epic 3).
// Manual-token path — kept as a documented fallback alongside the self-serve
// OAuth flow below (e.g. for workspaces whose Slack admin policy blocks
// third-party app installs).
integrationRouter.post(
  "/slack",
  requireAuth,
  validate(connectSlackRequestSchema),
  connectSlackHandler,
);

// Self-serve "Add to Slack" OAuth install (Bible §18 SLK-1). /install is the
// button target in the dashboard (JWT-authenticated); Slack itself calls
// /oauth/callback directly on the redirect back, so that route carries no
// auth middleware — the single-use, Redis-backed `state` param is the
// security mechanism there instead (see oauth-state.ts).
integrationRouter.get("/slack/install", requireAuth, installSlackHandler);
integrationRouter.get("/slack/oauth/callback", slackOAuthCallbackHandler);
// Not in the Bible -- lets the Queue page show connected state instead of
// always rendering "Connect Slack" regardless of whether it already is.
integrationRouter.get("/slack/status", requireAuth, slackStatusHandler);

// Server-to-server only: called by apps/slack-bot, never by end users.
integrationRouter.get("/slack/team/:slackTeamId", requireInternalService, resolveSlackTeamHandler);
integrationRouter.get(
  "/slack/by-argus-team/:teamId",
  requireInternalService,
  resolveSlackTeamByArgusTeamHandler,
);
integrationRouter.post(
  "/slack/link-user",
  requireInternalService,
  validate(linkSlackUserRequestSchema),
  linkSlackUserHandler,
);
integrationRouter.get(
  "/slack/user/:slackTeamId/:slackUserId",
  requireInternalService,
  resolveSlackUserHandler,
);
