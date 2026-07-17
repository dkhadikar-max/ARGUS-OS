import { z } from "zod";

// Bible §13.2 Pricing Tiers -- matches apps/website/components/CTASection.tsx's
// four cards exactly. The Policy v2.1 "Three Entry Paths" GTM pricing is
// deferred until the Phase 3 enterprise motion (2026-07-17 decision).
export const leadPathSchema = z.enum(["FREE", "STARTER", "PRO", "ENTERPRISE"]);
export type LeadPath = z.infer<typeof leadPathSchema>;

export const createLeadRequestSchema = z.object({
  path: leadPathSchema,
});
export type CreateLeadRequest = z.infer<typeof createLeadRequestSchema>;

export const createLeadResponseSchema = z.object({
  id: z.string(),
  path: leadPathSchema,
  createdAt: z.string().datetime(),
});
export type CreateLeadResponse = z.infer<typeof createLeadResponseSchema>;
