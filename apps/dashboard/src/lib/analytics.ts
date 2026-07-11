// Bible §18 INF-2 "PostHog event tracking" + §11.1's exact event catalog,
// shared with apps/api and apps/extension via packages/shared so every
// surface emits identical event/property shapes.
//
// The slim, no-external build (not the default "full" one): Bible §11.1
// defines a closed set of plain analytics events, with no need for
// PostHog's session replay, surveys, feature flags, or exception
// autocapture, all of which the default build pulls in regardless and
// some of which lazy-load from PostHog's CDN at runtime. Verified the same
// way apps/extension's own analytics.ts was: comparing actual built file
// sizes in node_modules/posthog-js/dist before choosing (slim.no-external
// is meaningfully smaller), not just assuming "slim" means what the name
// suggests.
import posthog from "posthog-js/dist/module.slim.no-external";
import type { AnalyticsEvent } from "@argus/shared";
import { env } from "./env";

let initialized = false;
let identifiedAs: string | null = null;

function ensureInitialized(): boolean {
  if (!env.NEXT_PUBLIC_POSTHOG_KEY) return false;
  if (!initialized) {
    posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
      // Bible §11.1 defines an explicit, closed set of events — autocapture
      // and pageview tracking would add untracked, unspecified events.
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
    });
    initialized = true;
  }
  return true;
}

/** Call once a signed-in ARGUS userId is known (components/
 *  PostHogIdentify.tsx does this via Clerk's useUser()), so every
 *  subsequent capture() is attributed to the right person without
 *  repeating the id on every call. */
export function identify(userId: string): void {
  if (!ensureInitialized() || identifiedAs === userId) return;
  posthog.identify(userId);
  identifiedAs = userId;
}

export function track(event: AnalyticsEvent): void {
  if (!ensureInitialized()) return;
  posthog.capture(event.name, event.properties);
}
