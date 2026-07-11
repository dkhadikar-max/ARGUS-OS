import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getCompanyMemoryHandler } from "./memory.controller.js";

export const memoryRouter = Router();

// Bible §10.5
memoryRouter.get("/", requireAuth, getCompanyMemoryHandler);
