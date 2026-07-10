import { Router } from "express";
import { connectSlackRequestSchema, linkSlackUserRequestSchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireInternalService } from "../../middleware/internal-auth.js";
import { validate } from "../../middleware/validate.js";
import {
  connectSlackHandler,
  linkSlackUserHandler,
  resolveSlackTeamByArgusTeamHandler,
  resolveSlackTeamHandler,
  resolveSlackUserHandler,
} from "./integration.controller.js";

export const integrationRouter = Router();

// End-user-facing: a team admin connects their Slack workspace (Bible §18 Epic 3).
integrationRouter.post(
  "/slack",
  requireAuth,
  validate(connectSlackRequestSchema),
  connectSlackHandler,
);

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
