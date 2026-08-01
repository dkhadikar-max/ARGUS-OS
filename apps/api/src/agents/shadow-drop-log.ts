// Gate 3 Increment 1.9 -- excess sampled shadow decisions are DROPPED,
// never queued (see shadow-concurrency.ts's own module comment), and
// today that drop is only visible via Datadog's fire-and-forget
// shadow.decision.dropped counter, which this codebase has no read API
// into. This is a small in-memory ring buffer, mirroring
// shadow-error-log.ts's exact pattern, so the Shadow Health Dashboard's
// "Drop count (last hour)" field has a real number to show. Per-process,
// in-memory, module-level state -- same documented per-process-only
// limitation as shadow-error-log.ts and shadow-concurrency.ts.

interface ShadowDropEntry {
  timestamp: number;
  reason: string;
}

const MAX_ENTRIES = 500; // safety cap against unbounded growth during a real sustained overload
const entries: ShadowDropEntry[] = [];

export function recordShadowDrop(reason: string, now: () => number = Date.now): void {
  entries.push({ timestamp: now(), reason });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

export function countShadowDropsSince(windowMs: number, now: () => number = Date.now): number {
  const cutoff = now() - windowMs;
  return entries.filter((e) => e.timestamp >= cutoff).length;
}

export function __resetShadowDropLogForTests(): void {
  entries.length = 0;
}
