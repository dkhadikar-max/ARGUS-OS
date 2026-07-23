import { Router } from "express";
import { rollbackPolicyRequestSchema, updatePolicyRequestSchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  getPolicyHandler,
  getPolicyVersionHistoryHandler,
  rollbackPolicyHandler,
  updatePolicyHandler,
} from "./policy.controller.js";

export const policyRouter = Router();

// ARGUS Unanimous Policy v2.1 "L4 Policy Engine" -- new as of this policy
// document, not the Bible; §10 obviously never contracts an endpoint for
// something that postdates it. Same shape as the sibling ICP endpoint
// (icp.routes.ts) this mirrors.
policyRouter.get("/", requireAuth, getPolicyHandler);
policyRouter.put("/", requireAuth, validate(updatePolicyRequestSchema), updatePolicyHandler);

// v4 roadmap Phase 5 -- additive versioning endpoints, same admin-only gate
// enforced inside the service layer (not duplicated as route middleware,
// matching how the two routes above already delegate that check).
policyRouter.get("/versions", requireAuth, getPolicyVersionHistoryHandler);
policyRouter.post("/rollback", requireAuth, validate(rollbackPolicyRequestSchema), rollbackPolicyHandler);
