// Gate 3 Increment 1.7 -- shadow-metrics.service.ts's own module comment
// is explicit: shadow failures are deliberately never persisted to the
// ShadowDecision table, only counted via Datadog's fire-and-forget
// shadow.decision.error metric, which this codebase has no read API
// into. This is a small in-memory ring buffer instead -- no schema
// change, reverses nothing -- so the Shadow Health card's "Errors (1h)"
// field has a real number to show. Per-process, in-memory, module-level
// state: if apps/api ever runs multiple instances, this only reflects
// whichever instance served the request, same documented limitation as
// shadow-concurrency.ts's own per-process cap.

interface ShadowErrorEntry {
  timestamp: number;
  reason: string;
}

const MAX_ENTRIES = 500; // safety cap against unbounded growth during a real sustained outage
const entries: ShadowErrorEntry[] = [];

export function recordShadowError(reason: string, now: () => number = Date.now): void {
  entries.push({ timestamp: now(), reason });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

export function countShadowErrorsSince(windowMs: number, now: () => number = Date.now): number {
  const cutoff = now() - windowMs;
  return entries.filter((e) => e.timestamp >= cutoff).length;
}

export function __resetShadowErrorLogForTests(): void {
  entries.length = 0;
}
