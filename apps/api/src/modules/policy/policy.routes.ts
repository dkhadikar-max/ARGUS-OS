import { Router } from "express";
import { updatePolicyRequestSchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { getPolicyHandler, updatePolicyHandler } from "./policy.controller.js";

export const policyRouter = Router();

// ARGUS Unanimous Policy v2.1 "L4 Policy Engine" -- new as of this policy
// document, not the Bible; §10 obviously never contracts an endpoint for
// something that postdates it. Same shape as the sibling ICP endpoint
// (icp.routes.ts) this mirrors.
policyRouter.get("/", requireAuth, getPolicyHandler);
policyRouter.put("/", requireAuth, validate(updatePolicyRequestSchema), updatePolicyHandler);
