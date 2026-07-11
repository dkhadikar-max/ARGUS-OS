import type { NextFunction, Request, Response } from "express";
import { AppError, type ConnectSlackRequest, type LinkSlackUserRequest } from "@argus/shared";
import * as integrationService from "./integration.service.js";
import { requestMeta } from "../../lib/audit.js";

export async function connectSlackHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const result = await integrationService.connectSlack(
      req.body as ConnectSlackRequest,
      req.auth,
      requestMeta(req),
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function resolveSlackTeamHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await integrationService.resolveSlackTeam(req.params["slackTeamId"] as string);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function resolveSlackTeamByArgusTeamHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await integrationService.resolveSlackTeamByArgusTeamId(
      req.params["teamId"] as string,
    );
    res.status(200).json(result); // null when this ARGUS team has no Slack integration
  } catch (err) {
    next(err);
  }
}

export async function linkSlackUserHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await integrationService.linkSlackUser(
      req.body as LinkSlackUserRequest,
      requestMeta(req),
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function resolveSlackUserHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await integrationService.resolveSlackUser(
      req.params["slackTeamId"] as string,
      req.params["slackUserId"] as string,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// Returns the authorize URL as JSON rather than a 302: this endpoint is
// authenticated via requireAuth's Bearer/x-api-key scheme (Bible §10.1),
// which only a same-origin fetch() with the dashboard's Clerk JWT can
// supply — a plain <a href> browser navigation carries no Authorization
// header. The dashboard fetches this, then does `window.location = url`
// itself to hand the browser off to Slack's consent screen.
export async function installSlackHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const url = await integrationService.initiateSlackOAuth(req.auth);
    res.status(200).json({ url });
  } catch (err) {
    next(err);
  }
}

export async function slackOAuthCallbackHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const redirectUrl = await integrationService.completeSlackOAuth(
      {
        code: req.query["code"] as string | undefined,
        state: req.query["state"] as string | undefined,
        error: req.query["error"] as string | undefined,
      },
      requestMeta(req),
    );
    res.redirect(302, redirectUrl);
  } catch (err) {
    next(err);
  }
}
