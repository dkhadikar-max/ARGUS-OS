import type { Request, Response, NextFunction } from "express";
import { AppError } from "@argus/shared";
import { getCompanyMemoryForTeam } from "./memory.service.js";

export async function getCompanyMemoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const memory = await getCompanyMemoryForTeam(req.auth.teamId);
    res.status(200).json(memory);
  } catch (err) {
    next(err);
  }
}
