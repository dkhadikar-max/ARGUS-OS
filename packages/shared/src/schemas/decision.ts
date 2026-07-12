import { z } from "zod";
import { actionTypeSchema, channelSchema, messageToneSchema, verdictSchema } from "./enums.js";
import { agentDebateOutputSchema } from "./agents.js";
import { policyFlagSchema } from "./policy.js";

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
  // Bible §6.5 "Full Debate View — Deep Inspection": the per-agent
  // (research/icp/intent/risk/judge) breakdown, distinct from `reasoning`
  // (the Judge's own summary) and `evidence` (flattened Evidence rows).
  // `options.includeDebate` above gates this on POST (undefined/omitted
  // when false, matching every one of §10.2's own worked examples, all of
  // which use `includeDebate: false`); GET /api/v1/decisions/{id} -- the
  // endpoint "View More" actually calls -- always includes it, since that
  // request exists specifically for deep inspection.
  debate: agentDebateOutputSchema.nullable().optional(),
  // Policy v2.1 L4 Policy Engine's "Policy Check" result -- empty array
  // when no rule matched, not the Bible, see packages/shared/schemas/policy.ts.
  policyFlags: z.array(policyFlagSchema).optional(),
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
  actionTaken: z
    .object({
      id: z.string(),
      actionType: actionTypeSchema,
      timestamp: z.string().datetime(),
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

// Bible §6.5 Full Debate View's "[Share with Team]" button -- §10 never
// contracts this endpoint (same category of gap as ActionTaken before it
// got one), inferred from the same shape as the sibling override/action
// endpoints above. Posts the decision to the team's connected Slack
// channel (apps/slack-bot's own alertChannelId), the team's one shared
// communication surface (Bible §7.1's own architecture diagram).
export const shareDecisionResponseSchema = z.object({
  shared: z.literal(true),
  channelId: z.string(),
});
export type ShareDecisionResponse = z.infer<typeof shareDecisionResponseSchema>;

// Bible §9.1 models MessageDraft.wasEdited/editDiff, and both surfaces that
// let a rep edit a generated message before sending -- the LinkedIn
// sidebar's own MessageComposer "Edit"/"Save" toggle, Slack's "Edit First"
// modal -- already tracked the edit locally, but §10 never contracts an
// endpoint to persist it (the same category of gap ActionTaken/Share had
// before they got one: a field §9.1 explicitly models with nothing writing
// to it, not a deliberately deferred feature). `body` becomes the
// MessageDraft's new current text; `editDiff` captures the *original*,
// pre-edit text once, on the first edit only, so it's always
// "first-known-good vs current" rather than "the previous edit vs this
// one" -- more useful for reviewing what a rep changed overall.
export const editMessageDraftRequestSchema = z.object({
  body: z.string().min(1),
});
export type EditMessageDraftRequest = z.infer<typeof editMessageDraftRequestSchema>;

export const editMessageDraftResponseSchema = z.object({
  id: z.string(),
  decisionId: z.string(),
  body: z.string(),
  wasEdited: z.boolean(),
  editDiff: z.string().nullable(),
});
export type EditMessageDraftResponse = z.infer<typeof editMessageDraftResponseSchema>;
