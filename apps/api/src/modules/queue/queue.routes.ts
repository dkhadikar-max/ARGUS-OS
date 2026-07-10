import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getQueueHandler } from "./queue.controller.js";

export const queueRouter = Router();

// Bible §10.4
queueRouter.get("/", requireAuth, getQueueHandler);
