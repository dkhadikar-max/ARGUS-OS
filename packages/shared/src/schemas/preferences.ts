import { z } from "zod";
import { channelSchema, messageToneSchema } from "./enums.js";

// Bible §9.1 UserPreferences model, verbatim allowed values (from that
// model's own inline comments) for the three plain-String fields it never
// gave a dedicated enum: messageLength, sidebarPosition, digestFrequency.
// §10 never contracts a REST endpoint for this model at all (same §10 gap
// as ActionTaken/ICPDefinition) -- inferred here, not assumed.
export const userPreferencesSchema = z.object({
  messageTone: messageToneSchema,
  messageLength: z.enum(["short", "medium", "long"]),
  autoVerdict: z.boolean(),
  sidebarPosition: z.enum(["left", "right"]),
  defaultChannel: channelSchema,
  digestFrequency: z.enum(["never", "daily", "weekly"]),
});
export type UserPreferencesData = z.infer<typeof userPreferencesSchema>;

// PUT /api/v1/preferences: a settings form submits every field's current
// value together, so this is a full replace, not a partial patch.
export const updateUserPreferencesRequestSchema = userPreferencesSchema;
export type UpdateUserPreferencesRequest = z.infer<typeof updateUserPreferencesRequestSchema>;

export const userPreferencesResponseSchema = userPreferencesSchema.extend({
  // null means these are schema defaults (Prisma's own @default values),
  // not yet an explicit save by this user -- an honest "never saved" state,
  // not a fabricated timestamp for something that hasn't happened.
  updatedAt: z.string().datetime().nullable(),
});
export type UserPreferencesResponse = z.infer<typeof userPreferencesResponseSchema>;
