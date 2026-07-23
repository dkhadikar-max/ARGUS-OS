import type { Request, Response, NextFunction } from "express";
import { AppError, type ResolveLearningRecommendationRequest } from "@argus/shared";
import { requestMeta } from "../../lib/audit.js";
import {
  listLearningRecommendationsForTeam,
  resolveLearningRecommendationForTeam,
} from "./learning-recommendation.service.js";

export async function listLearningRecommendationsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const result = await listLearningRecommendationsForTeam(req.auth);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function resolveLearningRecommendationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const id = req.params["id"];
    if (!id) throw new AppError("VALIDATION_ERROR", "id path parameter is required");
    const body = req.body as ResolveLearningRecommendationRequest;
    const result = await resolveLearningRecommendationForTeam(req.auth, id, body, requestMeta(req));
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
