import type { NextFunction, Request, Response } from "express";
import { AppError } from "@argus/shared";
import { env } from "../config/env.js";

/**
 * Guards server-to-server endpoints (currently only Slack integration
 * resolution, Bible §18 Epic 3) that have no end-user identity to check —
 * neither the Bearer JWT nor x-api-key schemes in §10.1 fit a process
 * calling on its own behalf, so this checks a separate shared secret.
 */
export function requireInternalService(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!env.INTERNAL_SERVICE_TOKEN) {
    next(new AppError("FORBIDDEN", "Internal service integrations are not configured"));
    return;
  }

  const token = req.header("x-internal-token");
  if (token !== env.INTERNAL_SERVICE_TOKEN) {
    next(new AppError("UNAUTHORIZED", "Invalid internal service token"));
    return;
  }

  next();
}
