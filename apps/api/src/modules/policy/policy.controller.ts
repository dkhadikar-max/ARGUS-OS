import type { Request, Response, NextFunction } from "express";
import { AppError, type RollbackPolicyRequest, type UpdatePolicyRequest } from "@argus/shared";
import {
  getPolicyForTeam,
  getPolicyVersionHistoryForTeam,
  rollbackPolicyForTeam,
  updatePolicyForTeam,
} from "./policy.service.js";
import { requestMeta } from "../../lib/audit.js";

export async function getPolicyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const policy = await getPolicyForTeam(req.auth);
    res.status(200).json(policy);
  } catch (err) {
    next(err);
  }
}

export async function updatePolicyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const body = req.body as UpdatePolicyRequest;
    const policy = await updatePolicyForTeam(req.auth, body, requestMeta(req));
    res.status(200).json(policy);
  } catch (err) {
    next(err);
  }
}

// v4 roadmap Phase 5 -- additive handlers, same auth/error-handling shape
// as the two above.

export async function getPolicyVersionHistoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const history = await getPolicyVersionHistoryForTeam(req.auth);
    res.status(200).json(history);
  } catch (err) {
    next(err);
  }
}

export async function rollbackPolicyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const body = req.body as RollbackPolicyRequest;
    const policy = await rollbackPolicyForTeam(req.auth, body.version, requestMeta(req));
    res.status(200).json(policy);
  } catch (err) {
    next(err);
  }
}
