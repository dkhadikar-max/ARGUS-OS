import { z } from "zod";

// Bible §10.5 — GET /api/v1/memory response, verbatim shape.
export const companyMemoryPatternSchema = z.object({
  id: z.string(),
  description: z.string(),
  evidence: z.string(),
  confidence: z.number().min(0).max(100),
  type: z.string(),
  createdAt: z.string().datetime(),
});
export type CompanyMemoryPattern = z.infer<typeof companyMemoryPatternSchema>;

export const companyMemoryRiskFlagSchema = z.object({
  id: z.string(),
  condition: z.string(),
  severity: z.string(),
  recommendation: z.string(),
  occurrenceRate: z.number().min(0).max(1),
  falsePositiveRate: z.number().min(0).max(1),
});
export type CompanyMemoryRiskFlag = z.infer<typeof companyMemoryRiskFlagSchema>;

export const companyMemoryResponseSchema = z.object({
  teamId: z.string(),
  generatedAt: z.string().datetime(),
  patterns: z.array(companyMemoryPatternSchema),
  riskFlags: z.array(companyMemoryRiskFlagSchema),
  // Nullable/empty-array fields aren't in §10.5's worked example (which
  // shows a mature, data-rich team), but are real, honest states this
  // endpoint can return for a team with no ICP version history yet, or no
  // outcome-linked messages yet — see README "Company Memory" section for
  // exactly what is/isn't computed today.
  icpAccuracy: z
    .object({
      current: z.number().min(0).max(1),
      trend: z.string(),
      lastUpdated: z.string().datetime(),
    })
    .nullable(),
  topPerformingMessages: z.array(
    z.object({
      pattern: z.string(),
      replyRate: z.number().min(0).max(1),
      sampleSize: z.number().int().nonnegative(),
    }),
  ),
});
export type CompanyMemoryResponse = z.infer<typeof companyMemoryResponseSchema>;
