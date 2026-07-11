const API_BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:4000";

// Server-side fetches (lib/api-client.ts) use API_BASE_URL above, which
// Next.js never ships to the browser. Bible §10.6's WebSocket connection is
// opened directly from the browser (a Clerk session token attached client-
// side, not proxied through a Server Component), so it needs the one env
// var Next.js *does* inline into client bundles: the NEXT_PUBLIC_ prefix.
// Next only statically replaces the literal `process.env.NEXT_PUBLIC_*`
// expression at build time, so this can't be derived from API_BASE_URL
// above at runtime -- it's set separately (usually to the same value).
const NEXT_PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// Bible §11.1 event tracking (queue_viewed/queue_item_clicked, lib/
// analytics.ts) — same NEXT_PUBLIC_ constraint as above: PostHog only
// works from the browser, so its key has to be one Next.js actually
// inlines into the client bundle. No-ops safely when unset, same pattern
// as every other analytics credential in this codebase.
const NEXT_PUBLIC_POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const NEXT_PUBLIC_POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";

export const env = {
  API_BASE_URL,
  NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST,
};
