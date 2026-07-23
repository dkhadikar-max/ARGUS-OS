import type { Request, Response, NextFunction } from "express";
import { AppError, type ProposeRoutingThresholdsRequest } from "@argus/shared";
import { requestMeta } from "../../lib/audit.js";
import {
  approveRoutingThresholdsForTeam,
  getRoutingThresholdStateForTeam,
  proposeRoutingThresholdsForTeam,
  rejectRoutingThresholdsForTeam,
} from "./routing.service.js";

export async function getRoutingThresholdStateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const state = await getRoutingThresholdStateForTeam(req.auth);
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
}

export async function proposeRoutingThresholdsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const body = req.body as ProposeRoutingThresholdsRequest;
    const entry = await proposeRoutingThresholdsForTeam(req.auth, body, requestMeta(req));
    res.status(201).json(entry);
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

export async function approveRoutingThresholdsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const entry = await approveRoutingThresholdsForTeam(req.auth, parseVersionParam(req), requestMeta(req));
    res.status(200).json(entry);
  } catch (err) {
    next(err);
  }
}

export async function rejectRoutingThresholdsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const entry = await rejectRoutingThresholdsForTeam(req.auth, parseVersionParam(req), requestMeta(req));
    res.status(200).json(entry);
  } catch (err) {
    next(err);
  }
}
