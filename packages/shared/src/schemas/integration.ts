import { z } from "zod";

// Bible §18 Epic 3 (Slack Bot) needs Team<->Slack-workspace and
// User<->Slack-member resolution that §10 never contracts — these schemas
// back the small internal API added for that purpose (see
// apps/api/src/modules/integrations).

export const connectSlackRequestSchema = z.object({
  slackTeamId: z.string().min(1),
  botToken: z.string().min(1),
  botUserId: z.string().min(1),
  alertChannelId: z.string().min(1),
});
export type ConnectSlackRequest = z.infer<typeof connectSlackRequestSchema>;

export const connectSlackResponseSchema = z.object({
  teamId: z.string(),
  apiKey: z.string(), // shown exactly once, at connection time
});
export type ConnectSlackResponse = z.infer<typeof connectSlackResponseSchema>;

export const slackTeamResolutionSchema = z.object({
  argusTeamId: z.string(),
  apiKey: z.string(),
  botToken: z.string(),
  botUserId: z.string(),
  alertChannelId: z.string(),
});
export type SlackTeamResolution = z.infer<typeof slackTeamResolutionSchema>;

export const linkSlackUserRequestSchema = z.object({
  slackTeamId: z.string().min(1),
  slackUserId: z.string().min(1),
  email: z.string().email(),
});
export type LinkSlackUserRequest = z.infer<typeof linkSlackUserRequestSchema>;

export const linkSlackUserResponseSchema = z.object({
  userId: z.string(),
  teamId: z.string(),
});
export type LinkSlackUserResponse = z.infer<typeof linkSlackUserResponseSchema>;

export const slackUserResolutionSchema = z.object({
  userId: z.string().nullable(),
});
export type SlackUserResolution = z.infer<typeof slackUserResolutionSchema>;
