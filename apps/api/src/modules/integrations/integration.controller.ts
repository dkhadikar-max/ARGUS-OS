import type { NextFunction, Request, Response } from "express";
import { AppError, type ConnectSlackRequest, type LinkSlackUserRequest } from "@argus/shared";
import * as integrationService from "./integration.service.js";

export async function connectSlackHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const result = await integrationService.connectSlack(req.body as ConnectSlackRequest, req.auth);
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
    const result = await integrationService.linkSlackUser(req.body as LinkSlackUserRequest);
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
