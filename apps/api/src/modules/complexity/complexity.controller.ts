import type { Request, Response, NextFunction } from "express";
import { AppError } from "@argus/shared";
import { requestMeta } from "../../lib/audit.js";
import {
  approveComplexityWeightsForTeam,
  getComplexityWeightStateForTeam,
  recomputeComplexityWeightsForTeam,
  rejectComplexityWeightsForTeam,
} from "./complexity.service.js";

export async function getComplexityWeightStateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const state = await getComplexityWeightStateForTeam(req.auth);
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
}

export async function recomputeComplexityWeightsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const result = await recomputeComplexityWeightsForTeam(req.auth, requestMeta(req));
    res.status(result.status === "proposed" ? 201 : 200).json(result);
  } catch (err) {
    next(err);
  }
}

function parseVersionParam(req: Request): number {
  const version = Number(req.params["version"]);
  if (!Number.isInteger(version) || version <= 0) {
    throw new AppError("VALIDATION_ERROR", "version must be a positive integer");
  }
  return version;
}

export async function approveComplexityWeightsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const entry = await approveComplexityWeightsForTeam(req.auth, parseVersionParam(req), requestMeta(req));
    res.status(200).json(entry);
  } catch (err) {
    next(err);
  }
}

export async function rejectComplexityWeightsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const entry = await rejectComplexityWeightsForTeam(req.auth, parseVersionParam(req), requestMeta(req));
    res.status(200).json(entry);
  } catch (err) {
    next(err);
  }
}
