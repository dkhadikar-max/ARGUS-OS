import { PostHog } from "posthog-node";
import type { AnalyticsEvent, UserProperties } from "@argus/shared";
import { env } from "../config/env.js";

// Bible §18 INF-2 "PostHog event tracking" (P0) + §11.1's exact event
// catalog (packages/shared/src/schemas/analytics.ts). No-ops safely
// without a real API key.
const client = env.POSTHOG_API_KEY
  ? new PostHog(env.POSTHOG_API_KEY, { host: env.POSTHOG_HOST })
  : null;

export function track(distinctId: string, event: AnalyticsEvent): void {
  client?.capture({ distinctId, event: event.name, properties: event.properties });
}

export function identify(distinctId: string, properties: UserProperties): void {
  client?.identify({ distinctId, properties });
}

export async function shutdownAnalytics(): Promise<void> {
  await client?.shutdown();
}
