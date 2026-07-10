import { z } from "zod";

// Bible §9.1 ICPDefinition.criteria JSON shape + §5.2 ICPDefinition object
// model. Weight is 0-1 and all weights for a definition should sum to 1
// (enforced in the service layer, not schema-level, since partial/duplicate
// weights are valid transient states while a manager edits the form).
export const icpCriterionSchema = z.object({
  field: z.string(),
  operator: z.enum(["equals", "in", "gte", "lte", "between", "contains"]),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
  weight: z.number().min(0).max(1),
});
export type IcpCriterion = z.infer<typeof icpCriterionSchema>;

export const icpDefinitionSchema = z.object({
  criteria: z.array(icpCriterionSchema),
});
export type IcpDefinitionData = z.infer<typeof icpDefinitionSchema>;

// Bible Appendix F — cold-start heuristic ICP shape (idealStage/minSize/etc.)
export const coldStartIcpSchema = z.object({
  idealStage: z.string(),
  minSize: z.number().int().nonnegative(),
  maxSize: z.number().int().nonnegative(),
  targetTitles: z.array(z.string()),
  targetIndustries: z.array(z.string()),
});
export type ColdStartIcp = z.infer<typeof coldStartIcpSchema>;
