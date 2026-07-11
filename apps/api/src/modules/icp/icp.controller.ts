import type { Request, Response, NextFunction } from "express";
import { AppError, type UpdateIcpRequest } from "@argus/shared";
import { getIcpForTeam, updateIcpForTeam } from "./icp.service.js";
import { requestMeta } from "../../lib/audit.js";

export async function getIcpHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const icp = await getIcpForTeam(req.auth);
    res.status(200).json(icp);
  } catch (err) {
    next(err);
  }
}

export async function updateIcpHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const body = req.body as UpdateIcpRequest;
    const icp = await updateIcpForTeam(req.auth, body, requestMeta(req));
    res.status(200).json(icp);
  } catch (err) {
    next(err);
  }
}
