import type { Request, Response, NextFunction } from "express";
import { AppError, reasoningAssetTypeSchema, type RegisterReasoningAssetRequest, type RecordEffectivenessRequest } from "@argus/shared";
import { requestMeta } from "../../lib/audit.js";
import {
  listReasoningAssetsForAuthTeam,
  recordEffectivenessScoreForAsset,
  registerReasoningAssetForTeam,
} from "./reasoning-asset.service.js";

export async function listReasoningAssetsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const rawType = req.query["assetType"];
    const assetType = typeof rawType === "string" ? reasoningAssetTypeSchema.parse(rawType) : undefined;
    const assets = await listReasoningAssetsForAuthTeam(req.auth, assetType);
    res.status(200).json({ assets });
  } catch (err) {
    next(err);
  }
}

export async function registerReasoningAssetHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const body = req.body as RegisterReasoningAssetRequest;
    const asset = await registerReasoningAssetForTeam(req.auth, body, requestMeta(req));
    res.status(200).json(asset);
  } catch (err) {
    next(err);
  }
}

export async function recordEffectivenessHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required");
    const assetId = req.params["id"];
    if (!assetId) throw new AppError("VALIDATION_ERROR", "id is required");
    const body = req.body as RecordEffectivenessRequest;
    const asset = await recordEffectivenessScoreForAsset(req.auth, assetId, body.score, requestMeta(req));
    res.status(200).json(asset);
  } catch (err) {
    next(err);
  }
}
