import type { Request, Response, NextFunction } from "express";
import {
  AppError,
  type CompleteOnboardingRequest,
  type SuggestCompanyContextRequest,
  type UpdateCompanyContextRequest,
} from "@argus/shared";
import {
  completeOnboardingForTeam,
  getTeamForUser,
  suggestCompanyContext,
  updateCompanyContextForTeam,
} from "./team.service.js";
import { requestMeta } from "../../lib/audit.js";

export async function getTeamHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const team = await getTeamForUser(req.auth);
    res.status(200).json(team);
  } catch (err) {
    next(err);
  }
}

export async function completeOnboardingHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const body = req.body as CompleteOnboardingRequest;
    const team = await completeOnboardingForTeam(req.auth, body, requestMeta(req));
    res.status(200).json(team);
  } catch (err) {
    next(err);
  }
}

export async function suggestCompanyContextHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const body = req.body as SuggestCompanyContextRequest;
    const suggested = await suggestCompanyContext(req.auth, body.websiteUrl);
    res.status(200).json({ suggested });
  } catch (err) {
    next(err);
  }
}

export async function updateCompanyContextHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const body = req.body as UpdateCompanyContextRequest;
    const team = await updateCompanyContextForTeam(req.auth, body.companyContext, requestMeta(req));
    res.status(200).json(team);
  } catch (err) {
    next(err);
  }
}
