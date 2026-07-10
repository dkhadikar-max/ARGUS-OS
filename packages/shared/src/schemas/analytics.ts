import { z } from "zod";
import { channelSchema, verdictSchema } from "./enums.js";

// Bible §11.1 PostHog Event Specification — a discriminated union so every
// call site gets compile-time-checked event names and matching property
// shapes, across every app that emits these (apps/api, apps/extension,
// apps/slack-bot, apps/dashboard all have their own PostHog client, since
// posthog-node and posthog-js aren't interchangeable, but the event
// contract between them must stay identical or the funnels in §11.2 break
// silently).

export const analyticsEventSchema = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("sidebar_opened"),
    properties: z.object({
      prospect_id: z.string(),
      source: z.enum(["profile", "company", "search"]),
      load_time_ms: z.number().nonnegative(),
    }),
  }),
  z.object({
    name: z.literal("verdict_generated"),
    properties: z.object({
      decision_id: z.string(),
      verdict: verdictSchema,
      confidence: z.number().min(0).max(100),
      processing_time_ms: z.number().nonnegative(),
      agent_consensus: z.string(),
    }),
  }),
  z.object({
    name: z.literal("verdict_accepted"),
    properties: z.object({
      decision_id: z.string(),
      verdict: verdictSchema,
      time_to_accept_ms: z.number().nonnegative(),
    }),
  }),
  z.object({
    name: z.literal("verdict_overridden"),
    properties: z.object({
      decision_id: z.string(),
      original_verdict: verdictSchema,
      new_verdict: verdictSchema,
      reason: z.string().nullable(),
    }),
  }),
  z.object({
    name: z.literal("message_copied"),
    properties: z.object({
      decision_id: z.string(),
      channel: channelSchema,
      tone: z.string(),
      was_edited: z.boolean(),
    }),
  }),
  z.object({
    name: z.literal("message_edited"),
    properties: z.object({
      decision_id: z.string(),
      edit_type: z.enum(["minor", "major"]),
      original_length: z.number().nonnegative(),
      new_length: z.number().nonnegative(),
    }),
  }),
  z.object({
    name: z.literal("message_sent"),
    properties: z.object({
      decision_id: z.string(),
      channel: channelSchema,
      time_from_copy_to_send_ms: z.number().nonnegative(),
    }),
  }),
  z.object({
    name: z.literal("outcome_logged"),
    properties: z.object({
      decision_id: z.string(),
      outcome_type: z.string(),
      time_to_outcome_days: z.number().nullable(),
      feedback_provided: z.boolean(),
    }),
  }),
  z.object({
    name: z.literal("slack_alert_received"),
    properties: z.object({
      decision_id: z.string(),
      response_time_ms: z.number().nullable(),
      action_taken: z.string().nullable(),
    }),
  }),
  z.object({
    name: z.literal("queue_viewed"),
    properties: z.object({
      item_count: z.number().nonnegative(),
      filter_applied: z.boolean(),
      time_spent_ms: z.number().nonnegative().optional(),
    }),
  }),
  z.object({
    name: z.literal("queue_item_clicked"),
    properties: z.object({
      decision_id: z.string(),
      rank: z.number().int().positive(),
      verdict: verdictSchema,
    }),
  }),
  z.object({
    name: z.literal("company_memory_viewed"),
    properties: z.object({
      section: z.string(),
      time_spent_ms: z.number().nonnegative(),
    }),
  }),
  z.object({
    name: z.literal("full_debate_viewed"),
    properties: z.object({
      decision_id: z.string(),
      agent_viewed: z.string(),
      time_spent_ms: z.number().nonnegative(),
    }),
  }),
  z.object({
    name: z.literal("settings_changed"),
    properties: z.object({
      setting_name: z.string(),
      old_value: z.string(),
      new_value: z.string(),
    }),
  }),
  z.object({
    name: z.literal("integration_connected"),
    properties: z.object({
      provider: z.string(),
      auth_method: z.string(),
      time_to_connect_ms: z.number().nonnegative(),
    }),
  }),
  z.object({
    name: z.literal("plan_upgraded"),
    properties: z.object({
      old_plan: z.string(),
      new_plan: z.string(),
      seats_added: z.number().int(),
      revenue_impact: z.number(),
    }),
  }),
  z.object({
    name: z.literal("plan_downgraded"),
    properties: z.object({
      old_plan: z.string(),
      new_plan: z.string(),
      reason: z.string().optional(),
    }),
  }),
]);

export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type AnalyticsEventName = AnalyticsEvent["name"];

// Bible §11.1 User Properties table.
export const userPropertiesSchema = z.object({
  role: z.enum(["SDR", "AE", "MANAGER", "FOUNDER", "ADMIN"]).optional(),
  team_size: z.number().int().nonnegative().optional(),
  decisions_made: z.number().int().nonnegative().optional(),
  override_rate: z.number().min(0).max(1).optional(),
  accuracy_score: z.number().min(0).max(1).optional(),
  weekly_active: z.boolean().optional(),
  days_since_last_decision: z.number().int().nonnegative().optional(),
  plan_tier: z.string().optional(),
  ltv: z.number().optional(),
  cac: z.number().optional(),
});
export type UserProperties = z.infer<typeof userPropertiesSchema>;
