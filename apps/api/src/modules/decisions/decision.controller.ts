import type { Request, Response, NextFunction } from "express";
import { AppError, type CreateDecisionRequest, type OverrideDecisionRequest } from "@argus/shared";
import * as decisionService from "./decision.service.js";

export async function createDecisionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const body = req.body as CreateDecisionRequest;
    const decision = await decisionService.createDecision(body, req.auth);
    res.status(200).json(decision);
  } catch (err) {
    next(err);
  }
}

export async function getDecisionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const decision = await decisionService.getDecision(req.params["id"] as string, req.auth);
    res.status(200).json(decision);
  } catch (err) {
    next(err);
  }
}

export async function overrideDecisionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const body = req.body as OverrideDecisionRequest;
    const result = await decisionService.overrideDecision(
      req.params["id"] as string,
      body,
      req.auth,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
