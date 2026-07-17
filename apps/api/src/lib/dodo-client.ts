import DodoPayments from "dodopayments";
import { env } from "../config/env.js";

// Bible §5.2 "BillingSubscription" -- Dodo Payments, not Stripe (unavailable
// in India). Null when unconfigured, same optional-credential pattern as
// lib/redis.ts/lib/datadog.ts -- billing.service.ts throws a clear FORBIDDEN
// error at the one call site that actually needs this, rather than crashing
// boot for every deployment that hasn't set up billing yet.
export const dodo = env.DODO_PAYMENTS_API_KEY
  ? new DodoPayments({
      bearerToken: env.DODO_PAYMENTS_API_KEY,
      environment: env.DODO_PAYMENTS_ENVIRONMENT,
    })
  : null;
