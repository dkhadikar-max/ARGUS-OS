import type { PlanTier } from "@argus/database";
import { AppError, type CreateCheckoutRequest, type CreateCheckoutResponse, type PaidPlanTier } from "@argus/shared";
import { env } from "../../config/env.js";
import { dodo } from "../../lib/dodo-client.js";
import { logger } from "../../lib/logger.js";
import { ADMIN_ROLES, type AuthContext } from "../../middleware/auth.js";
import {
  activateSubscription,
  downgradeToFree,
  findTeamBySubscriptionId,
  getTeam,
  getUserEmail,
  setBillingStatus,
} from "./billing.repository.js";

// Dodo has no API to create Products (dashboard-only, unlike Stripe) -- these
// come from env vars pointing at the 3 products created once in the Dodo
// Dashboard (see env.ts). Free ($0) never reaches this map.
const PLAN_PRODUCT_IDS: Record<PaidPlanTier, string | undefined> = {
  STARTER: env.DODO_PRODUCT_STARTER,
  PRO: env.DODO_PRODUCT_PRO,
  ENTERPRISE: env.DODO_PRODUCT_ENTERPRISE,
};

/** Reverse lookup: a webhook only carries the Dodo product_id that was
 *  purchased, not which of our three named tiers it maps to. */
function planForProductId(productId: string): PlanTier | null {
  for (const [plan, id] of Object.entries(PLAN_PRODUCT_IDS)) {
    if (id === productId) return plan as PlanTier;
  }
  return null;
}

export async function createCheckoutSession(
  auth: AuthContext,
  request: CreateCheckoutRequest,
): Promise<CreateCheckoutResponse> {
  // Same gate icp.service.ts/team.service.ts use -- changing what the whole
  // team pays for is team-admin territory, not an individual rep's call.
  if (!auth.role || !ADMIN_ROLES.has(auth.role)) {
    throw new AppError("FORBIDDEN", "Only a team admin can change billing");
  }
  if (!dodo) {
    throw new AppError("FORBIDDEN", "Billing is not configured on this server");
  }
  const productId = PLAN_PRODUCT_IDS[request.plan];
  if (!productId) {
    throw new AppError("FORBIDDEN", `No Dodo product configured for the ${request.plan} plan`);
  }

  const team = await getTeam(auth.teamId);
  if (!team) throw new AppError("NOT_FOUND", "Team not found");
  // auth.role passed the ADMIN_ROLES check above, which only ever applies to
  // a real signed-in User (api-key-only contexts have no role) -- userId is
  // always present here.
  const user = await getUserEmail(auth.userId!);

  const session = await dodo.checkoutSessions.create({
    product_cart: [{ product_id: productId, quantity: 1 }],
    customer: user ? { email: user.email } : undefined,
    return_url: `${env.DASHBOARD_URL}/billing?checkout=complete`,
    cancel_url: `${env.DASHBOARD_URL}/billing?checkout=cancelled`,
    // Carries through to the subscription object on every subsequent
    // webhook (subscription.active/renewed/etc.), which is how
    // handleDodoWebhookEvent below maps a webhook back to a Team without
    // needing to already know its Dodo customer id.
    metadata: { teamId: auth.teamId },
  });

  if (!session.checkout_url) {
    // Only null when payment_method_id is passed above, which this call
    // never does -- a defensive invariant check, not an expected user-facing
    // failure.
    throw new Error("Dodo Payments did not return a checkout_url");
  }

  return { checkoutUrl: session.checkout_url };
}

export async function handleDodoWebhookEvent(eventType: string, data: unknown): Promise<void> {
  switch (eventType) {
    case "subscription.active":
    case "subscription.renewed": {
      const sub = data as {
        subscription_id: string;
        product_id: string;
        customer: { customer_id: string };
        metadata?: Record<string, unknown>;
      };
      const teamId = typeof sub.metadata?.teamId === "string" ? sub.metadata.teamId : undefined;
      if (!teamId) {
        logger.warn({ subscriptionId: sub.subscription_id }, "Dodo subscription webhook missing teamId metadata; skipping");
        return;
      }
      const plan = planForProductId(sub.product_id);
      if (!plan) {
        logger.warn({ productId: sub.product_id }, "Dodo subscription webhook for unrecognized product; skipping");
        return;
      }
      await activateSubscription(teamId, {
        plan,
        customerId: sub.customer.customer_id,
        subscriptionId: sub.subscription_id,
      });
      logger.info({ teamId, plan, eventType }, "Team subscription activated");
      return;
    }

    case "subscription.on_hold": {
      const sub = data as { subscription_id: string };
      const team = await findTeamBySubscriptionId(sub.subscription_id);
      if (!team) return;
      await setBillingStatus(team.id, "PAST_DUE");
      logger.warn({ teamId: team.id }, "Team subscription on hold (renewal failed)");
      return;
    }

    case "subscription.cancelled":
    case "subscription.expired": {
      const sub = data as { subscription_id: string };
      const team = await findTeamBySubscriptionId(sub.subscription_id);
      if (!team) return;
      await downgradeToFree(team.id);
      logger.info({ teamId: team.id, eventType }, "Team subscription ended; downgraded to Free");
      return;
    }

    case "subscription.failed": {
      // Terminal -- the subscription never activated, so there's no team
      // state to revert. Dodo's own guidance: never grant entitlements here.
      logger.warn({ data }, "Dodo subscription creation failed");
      return;
    }

    default:
      logger.debug({ eventType }, "Unhandled Dodo webhook event type");
  }
}
