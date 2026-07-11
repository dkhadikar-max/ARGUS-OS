import { z } from "zod";
import { actionTypeSchema } from "./enums.js";

// Bible §5.2/§9.1 model the Action Graph's ActionTaken row (one per
// Decision — @unique decisionId), but §10 never contracts a REST endpoint
// for it (an API-spec gap, not a deliberately deferred feature: unlike
// Pinecone/cold-start's explicit "Week 3+" framing in §5.3, the Action
// Graph is one of §5.1's five core Day-1 graphs). This schema backs
// POST /api/v1/decisions/{id}/action, inferred from the same shape as the
// sibling Override/Outcome endpoints §10.2/§10.3 do contract.
export const createActionRequestSchema = z.object({
  actionType: actionTypeSchema,
  details: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type CreateActionRequest = z.infer<typeof createActionRequestSchema>;

export const createActionResponseSchema = z.object({
  id: z.string(),
  decisionId: z.string(),
  actionType: actionTypeSchema,
  details: z.record(z.string(), z.unknown()).nullable(),
  timestamp: z.string().datetime(),
});
export type CreateActionResponse = z.infer<typeof createActionResponseSchema>;
