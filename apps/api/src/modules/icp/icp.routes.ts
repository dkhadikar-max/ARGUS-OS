import { Router } from "express";
import { updateIcpRequestSchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { getIcpHandler, updateIcpHandler } from "./icp.controller.js";

export const icpRouter = Router();

// Bible §9.1 ICPDefinition, §18 DSH-5 "Team ICP editor" -- §10 never
// contracts a REST endpoint for this model (see icp.ts).
icpRouter.get("/", requireAuth, getIcpHandler);
icpRouter.put("/", requireAuth, validate(updateIcpRequestSchema), updateIcpHandler);
