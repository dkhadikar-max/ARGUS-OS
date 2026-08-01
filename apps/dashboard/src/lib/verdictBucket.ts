import type { Verdict } from "@argus/shared";

// Decision Workspace -- presentation-only 3-way grouping of the real
// 5-value Verdict enum, for a fast list-scan (the Queue pane's filter
// chips and row dots). Mirrors the one existing precedent for this exact
// kind of collapsing, queue.service.ts's own `stats.pass = PASS +
// HARD_PASS`. Never changes the real enum or what's stored server-side --
// the full 5-value verdict stays visible via VerdictBadge in the Decision
// Workspace pane.
export type VerdictBucket = "Contact" | "Wait" | "Ignore";

export const VERDICT_BUCKETS: VerdictBucket[] = ["Contact", "Wait", "Ignore"];

const VERDICT_BUCKET: Record<Verdict, VerdictBucket> = {
  STRONG_YES: "Contact",
  YES: "Contact",
  WAIT: "Wait",
  PASS: "Ignore",
  HARD_PASS: "Ignore",
};

export function verdictBucket(verdict: Verdict): VerdictBucket {
  return VERDICT_BUCKET[verdict];
}
