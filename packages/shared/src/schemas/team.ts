import { z } from "zod";
import { icpCriterionSchema } from "./icp.js";

// Bible §5.2 object model (User -> Team -> ICPDefinition/CompanyMemory/
// BillingSubscription) + §9.1 Team model. No REST contract for Team exists
// in §10 (same gap as ICPDefinition/UserPreferences) -- inferred from the
// object model plus the new company-onboarding wizard's needs.
export const teamResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  plan: z.enum(["FREE", "STARTER", "PRO", "ENTERPRISE"]),
  billingStatus: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED"]),
  onboardedAt: z.string().datetime().nullable(),
});
export type TeamResponse = z.infer<typeof teamResponseSchema>;

// One combined submit for the onboarding wizard's single step (company name
// + initial ICP) rather than two separate round-trips -- there's no
// meaningful intermediate state to save between them.
export const completeOnboardingRequestSchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(100),
  criteria: z.array(icpCriterionSchema),
});
export type CompleteOnboardingRequest = z.infer<typeof completeOnboardingRequestSchema>;
