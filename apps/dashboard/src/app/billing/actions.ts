"use server";

import { redirect } from "next/navigation";
import type { PaidPlanTier } from "@argus/shared";
import { api, ApiError } from "../../lib/api-client";

export interface CheckoutActionResult {
  ok: boolean;
  error?: string;
}

// Bible §18 DSH-5 "Billing page" (P2). redirect() throws internally and
// never returns, so only the failure path below ever produces a result
// object for the billing page to render -- success sends the browser
// straight to Dodo's hosted checkout_url (an external redirect, same as
// any Stripe-style checkout integration).
export async function createCheckoutAction(plan: PaidPlanTier): Promise<CheckoutActionResult> {
  let checkoutUrl: string;
  try {
    const result = await api.createCheckout({ plan });
    checkoutUrl = result.checkoutUrl;
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Failed to start checkout" };
  }

  redirect(checkoutUrl);
}
