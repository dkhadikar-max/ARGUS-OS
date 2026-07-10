import type { Request, Response, NextFunction } from "express";
import { AppError, type CreateOutcomeRequest, type ListOutcomesQuery } from "@argus/shared";
import * as outcomeService from "./outcome.service.js";

export async function createOutcomeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const body = req.body as CreateOutcomeRequest;
    const outcome = await outcomeService.createOutcome(body, req.auth);
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

    if (req.auth.type === "user" && query.teamId !== req.auth.teamId) {
      throw new AppError("FORBIDDEN", "Cannot list outcomes for another team");
    }

    const result = await outcomeService.listOutcomesForTeam(query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
