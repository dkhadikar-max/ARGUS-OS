import { z } from "zod";

// ARGUS Unanimous Policy v2.1 "Seven-Layer Stack", L4 "Policy Engine" --
// "Configurable rules (JSON)" for V1/MVP, gating a decision before it
// reaches human approval / execution (the "Governor Model"). Not part of
// the original Bible (no "policy"/"governance" match anywhere in the full
// 73-page text) -- introduced fresh by this separate, later, frozen
// document. Shape mirrors icp.ts's IcpCriterion exactly (same operator set,
// same "one JSON blob per team" pattern) for consistency with the existing
// per-team configurable-rules precedent, not because the Bible specifies it.
export const policyActionSchema = z.enum(["BLOCK", "REQUIRE_APPROVAL", "FLAG"]);
export type PolicyAction = z.infer<typeof policyActionSchema>;

// V1 supports a fixed, small set of fields the Policy Check can reason
// about at decision-creation time -- see policy.service.ts's
// evaluatePolicyRules for exactly what each one reads.
export const policyFieldSchema = z.enum(["verdict", "confidence", "prospect.title"]);
export type PolicyField = z.infer<typeof policyFieldSchema>;

export const policyRuleSchema = z.object({
  field: policyFieldSchema,
  operator: z.enum(["equals", "in", "gte", "lte", "contains"]),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
  action: policyActionSchema,
  message: z.string().min(1),
});
export type PolicyRule = z.infer<typeof policyRuleSchema>;

export const updatePolicyRequestSchema = z.object({
  rules: z.array(policyRuleSchema),
});
export type UpdatePolicyRequest = z.infer<typeof updatePolicyRequestSchema>;

export const policyResponseSchema = z.object({
  teamId: z.string(),
  rules: z.array(policyRuleSchema),
  version: z.number().int().nonnegative(),
  updatedAt: z.string().datetime().nullable(),
});
export type PolicyResponse = z.infer<typeof policyResponseSchema>;

// The result of evaluating a decision against a team's active policy rules
// -- attached to Decision.policyFlags and surfaced in DecisionResponse.
export const policyFlagSchema = z.object({
  field: policyFieldSchema,
  action: policyActionSchema,
  message: z.string(),
});
export type PolicyFlag = z.infer<typeof policyFlagSchema>;
