import { z } from "zod";

// Bible §13.2 pricing tiers, Free excluded -- a $0 plan needs no checkout.
// Billing provider is Dodo Payments, not Stripe (unavailable in India); see
// apps/api's billing module.
export const paidPlanTierSchema = z.enum(["STARTER", "PRO", "ENTERPRISE"]);
export type PaidPlanTier = z.infer<typeof paidPlanTierSchema>;

export const createCheckoutRequestSchema = z.object({
  plan: paidPlanTierSchema,
});
export type CreateCheckoutRequest = z.infer<typeof createCheckoutRequestSchema>;

export const createCheckoutResponseSchema = z.object({
  checkoutUrl: z.string().url(),
});
export type CreateCheckoutResponse = z.infer<typeof createCheckoutResponseSchema>;
