// Bible §18 INF-2 "PostHog event tracking" (P0) + §11.1's exact event
// catalog, shared with apps/api via packages/shared so both surfaces emit
// identical event/property shapes.
//
// Manifest V3 forbids remote-hosted or eval'd code in the extension
// context (content_security_policy.extension_pages defaults to
// `script-src 'self'`, and MV3 removed the ability to relax this the way
// MV2 allowed). posthog-js's default build lazy-loads session-replay/
// surveys/feature-flags code from PostHog's CDN at runtime, which would
// violate that CSP outright. Verified directly against PostHog's own docs
// (posthog.com/docs/libraries/js) before writing this: importing from
// `posthog-js/dist/module.full.no-external` instead pre-bundles every
// dependency at build time — Vite inlines it into the content script
// bundle, so no runtime script-src violation is possible. The only
// documented tradeoff is losing the PostHog toolbar overlay, which this
// product has no use for anyway.
//
// Using the "slim" variant, not "full": Bible §11.1 defines a closed set of
// plain analytics events, with no need for PostHog's session replay,
// surveys, feature flags, or exception autocapture, all of which "full"
// bundles in regardless. Confirmed by comparing the actual built file
// sizes in node_modules/posthog-js/dist before choosing: slim.no-external
// is ~119KB vs. full.no-external's ~522KB, a meaningful difference for a
// content script bundle against the §7.4 <2s sidebar load target.
import posthog from "posthog-js/dist/module.slim.no-external";
import type { AnalyticsEvent } from "@argus/shared";

const POSTHOG_KEY = import.meta.env["VITE_POSTHOG_KEY"] as string | undefined;
const POSTHOG_HOST = (import.meta.env["VITE_POSTHOG_HOST"] as string | undefined) ?? "https://app.posthog.com";

let initialized = false;
let identifiedAs: string | null = null;

function ensureInitialized(): boolean {
  if (!POSTHOG_KEY) return false;
  if (!initialized) {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
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

/** Call once a signed-in ARGUS userId is known (App.tsx does this right
 *  after auth.get() resolves), so every subsequent capture() is attributed
 *  to the right person without repeating the id on every call. */
export function identify(userId: string): void {
  if (!ensureInitialized() || identifiedAs === userId) return;
  posthog.identify(userId);
  identifiedAs = userId;
}

export function track(event: AnalyticsEvent): void {
  if (!ensureInitialized()) return;
  posthog.capture(event.name, event.properties);
}
