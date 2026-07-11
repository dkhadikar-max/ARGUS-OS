import type { Request, Response, NextFunction } from "express";
import { AppError, type CreateOutcomeRequest, type ListOutcomesQuery } from "@argus/shared";
import * as outcomeService from "./outcome.service.js";
import { requestMeta } from "../../lib/audit.js";

export async function createOutcomeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const body = req.body as CreateOutcomeRequest;
    const outcome = await outcomeService.createOutcome(body, req.auth, requestMeta(req));
    res.status(200).json(outcome);
  } catch (err) {
    next(err);
  }
}

export async function listOutcomesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const query = req.query as unknown as ListOutcomesQuery;

    // Applies regardless of auth type: a team-scoped API key must not be
    // able to read another team's outcomes just by passing a different
    // teamId in the query string. (Previously only checked for JWT/"user"
    // auth, leaving api_key callers unchecked entirely — no caller in this
    // codebase actually depends on that, since even the Slack bot's
    // API key usage only ever queries its own team.)
    if (query.teamId !== req.auth.teamId) {
      throw new AppError("FORBIDDEN", "Cannot list outcomes for another team");
    }

    const result = await outcomeService.listOutcomesForTeam(query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
