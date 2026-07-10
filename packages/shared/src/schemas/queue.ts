import { z } from "zod";
import { verdictSchema } from "./enums.js";

// Bible §10.4 — GET /api/v1/queue response
export const queueItemSchema = z.object({
  rank: z.number().int().positive(),
  decisionId: z.string(),
  prospect: z.object({
    name: z.string(),
    title: z.string().nullable(),
    companyName: z.string().nullable(),
    linkedInUrl: z.string().url(),
  }),
  verdict: verdictSchema,
  confidence: z.number().min(0).max(100),
  priorityScore: z.number(),
  reason: z.string(),
  lastActivity: z.string(),
  suggestedAction: z.string(),
  messagePreview: z.string().nullable(),
});
export type QueueItem = z.infer<typeof queueItemSchema>;

export const queueResponseSchema = z.object({
  userId: z.string(),
  generatedAt: z.string().datetime(),
  items: z.array(queueItemSchema),
  stats: z.object({
    total: z.number().int().nonnegative(),
    strongYes: z.number().int().nonnegative(),
    yes: z.number().int().nonnegative(),
    wait: z.number().int().nonnegative(),
    pass: z.number().int().nonnegative(),
    newSinceYesterday: z.number().int().nonnegative(),
    reEngagements: z.number().int().nonnegative(),
  }),
});
export type QueueResponse = z.infer<typeof queueResponseSchema>;
