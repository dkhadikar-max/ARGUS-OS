import { Router } from "express";
import { createCheckoutRequestSchema } from "@argus/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { createCheckoutHandler } from "./billing.controller.js";

export const billingRouter = Router();

// Bible §5.2 "BillingSubscription", §13.2 pricing tiers -- §10 never
// contracts a REST endpoint for this either (same gap as Team/ICPDefinition).
// The webhook counterpart (POST /api/v1/webhooks/dodo) lives on
// webhookRouter instead, since it needs the raw body express.raw()
// provides, not this router's normal JSON parsing.
billingRouter.post("/checkout", requireAuth, validate(createCheckoutRequestSchema), createCheckoutHandler);
