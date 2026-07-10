import type { Request, Response, NextFunction } from "express";
import { AppError } from "@argus/shared";
import { getQueueForUser } from "./queue.service.js";

export async function getQueueHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth?.userId) {
      throw new AppError("UNAUTHORIZED", "A user session is required to view the queue");
    }
    const queue = await getQueueForUser(req.auth.userId, req.auth.teamId);
    res.status(200).json(queue);
  } catch (err) {
    next(err);
  }
}
