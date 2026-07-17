import { Router } from "express";
import { createLeadRequestSchema } from "@argus/shared";
import { validate } from "../../middleware/validate.js";
import { createLeadHandler } from "./lead.controller.js";
import { leadIpRateLimit } from "./lead-rate-limit.js";

export const leadRouter = Router();

// Public: apps/website's CTASection.tsx calls this from an unauthenticated
// marketing-site visitor, not a signed-in ARGUS user -- no requireAuth.
leadRouter.post("/", leadIpRateLimit, validate(createLeadRequestSchema), createLeadHandler);
