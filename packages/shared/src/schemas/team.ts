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
  companyContext: z.string().nullable(),
});
export type TeamResponse = z.infer<typeof teamResponseSchema>;

const companyContextSchema = z.string().trim().max(4000, "Keep it under 4000 characters").optional();

// One combined submit for the onboarding wizard's single step (company name
// + initial ICP + optional company context) rather than separate round-trips
// -- there's no meaningful intermediate state to save between them.
export const completeOnboardingRequestSchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(100),
  criteria: z.array(icpCriterionSchema),
  companyContext: companyContextSchema,
});
export type CompleteOnboardingRequest = z.infer<typeof completeOnboardingRequestSchema>;

// Fetches a website's homepage and asks Claude to draft a suggested company
// profile -- returned to the client for the user to edit/confirm, never
// saved directly (Bible has no wireframe for this; matches the "user
// confirms before save" pattern chosen for onboarding's AI-suggested text).
export const suggestCompanyContextRequestSchema = z.object({
  websiteUrl: z.string().trim().url("Enter a valid URL"),
});
export type SuggestCompanyContextRequest = z.infer<typeof suggestCompanyContextRequestSchema>;

export const suggestCompanyContextResponseSchema = z.object({
  suggested: z.string(),
});
export type SuggestCompanyContextResponse = z.infer<typeof suggestCompanyContextResponseSchema>;

export const updateCompanyContextRequestSchema = z.object({
  companyContext: companyContextSchema,
});
export type UpdateCompanyContextRequest = z.infer<typeof updateCompanyContextRequestSchema>;
