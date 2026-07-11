// Bible §19.1 "CORS allows only approved origins" — shared between app.ts
// (REST) and lib/websocket.ts (Socket.IO), which both need identical
// origin-matching logic rather than two copies that could drift.
//
// Only `chrome-extension://` entries use a prefix match, since the
// extension ID varies per build and can't be known exactly ahead of time.
// Every other entry (a real https:// origin, e.g. the deployed dashboard)
// must match *exactly* — a prefix match there was a real CORS bypass: an
// attacker's own origin `https://your-dashboard.vercel.app.evil.com`
// literally starts with the allowed `https://your-dashboard.vercel.app`
// string, so `origin.startsWith(entry)` let it through as if it were the
// real dashboard, with `credentials: true` on top of that.
const PREFIX_MATCH_SCHEME = "chrome-extension://";

export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.some((entry) =>
    entry.startsWith(PREFIX_MATCH_SCHEME) ? origin.startsWith(entry) : origin === entry,
  );
}
