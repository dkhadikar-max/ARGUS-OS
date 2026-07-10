import { z } from "zod";
import { channelSchema, messageToneSchema, verdictSchema } from "./enums.js";

// Bible §10.2 — POST /api/v1/decisions request body
export const createDecisionRequestSchema = z.object({
  prospect: z.object({
    linkedInUrl: z.string().url(),
    name: z.string().min(1),
    title: z.string().optional(),
    companyName: z.string().optional(),
    companyDomain: z.string().optional(),
  }),
  context: z.object({
    source: z.enum(["linkedin_sidebar", "slack_bot", "dashboard", "api"]),
    trigger: z.enum(["profile_view", "manual", "queue_refresh"]),
    userId: z.string(),
    teamId: z.string(),
  }),
  options: z
    .object({
      generateMessage: z.boolean().default(true),
      messageChannel: channelSchema.default("LINKEDIN"),
      messageTone: messageToneSchema.default("professional"),
      includeDebate: z.boolean().default(false),
    })
    .default({}),
});
export type CreateDecisionRequest = z.infer<typeof createDecisionRequestSchema>;

const evidenceCardSchema = z.object({
  id: z.string(),
  type: z.string(),
  signal: z.string(),
  relevance: z.string(),
  confidence: z.number().min(0).max(100),
});

const messagePayloadSchema = z.object({
  linkedin: z.string().nullable(),
  email: z.string().nullable(),
  tone: messageToneSchema,
  personalizationHooks: z.array(z.string()),
});

// Bible §10.2's worked example omits prospect identity from the response
// body (the LinkedIn sidebar already has it from the page it's injected
// into), but surfaces with no page context — Slack alerts (§6.4), the web
// dashboard — need it to render anything at all. Extending the contract
// with the same prospect summary shape §10.4's queue response already uses.
const prospectSummarySchema = z.object({
  name: z.string(),
  title: z.string().nullable(),
  companyName: z.string().nullable(),
  linkedInUrl: z.string(),
});

// Bible §10.2 — 200 OK synchronous response
export const decisionResponseSchema = z.object({
  id: z.string(),
  status: z.enum(["completed", "processing", "failed"]),
  prospect: prospectSummarySchema,
  verdict: verdictSchema,
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  evidence: z.array(evidenceCardSchema),
  message: messagePayloadSchema,
  recommendedAction: z.enum([
    "message_now",
    "research_more",
    "wait_for_signal",
    "pass_and_move_on",
  ]),
  processingTimeMs: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  outcome: z
    .object({
      id: z.string(),
      type: z.string(),
      loggedAt: z.string().datetime(),
    })
    .nullable()
    .optional(),
  override: z
    .object({
      id: z.string(),
      newVerdict: verdictSchema,
      reason: z.string().nullable(),
    })
    .nullable()
    .optional(),
  updatedAt: z.string().datetime().optional(),
});
export type DecisionResponse = z.infer<typeof decisionResponseSchema>;

// Bible §10.2 — 202 Accepted async response
export const decisionProcessingResponseSchema = z.object({
  id: z.string(),
  status: z.literal("processing"),
  estimatedCompletionMs: z.number().int().positive(),
  pollUrl: z.string(),
});
export type DecisionProcessingResponse = z.infer<
  typeof decisionProcessingResponseSchema
>;

// Bible §10.2 — POST /api/v1/decisions/{id}/override request body
export const overrideDecisionRequestSchema = z.object({
  newVerdict: verdictSchema,
  reason: z.string().optional(),
});
export type OverrideDecisionRequest = z.infer<
  typeof overrideDecisionRequestSchema
>;

export const overrideDecisionResponseSchema = z.object({
  id: z.string(),
  originalVerdict: verdictSchema,
  newVerdict: verdictSchema,
  reason: z.string().nullable(),
  overrideId: z.string(),
  createdAt: z.string().datetime(),
});
export type OverrideDecisionResponse = z.infer<
  typeof overrideDecisionResponseSchema
>;
