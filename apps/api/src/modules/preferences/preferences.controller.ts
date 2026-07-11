import type { Request, Response, NextFunction } from "express";
import { AppError, type UpdateUserPreferencesRequest } from "@argus/shared";
import { getPreferences, updatePreferences } from "./preferences.service.js";

export async function getPreferencesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const preferences = await getPreferences(req.auth);
    res.status(200).json(preferences);
  } catch (err) {
    next(err);
  }
}

export async function updatePreferencesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const body = req.body as UpdateUserPreferencesRequest;
    const preferences = await updatePreferences(req.auth, body);
    res.status(200).json(preferences);
  } catch (err) {
    next(err);
  }
}
