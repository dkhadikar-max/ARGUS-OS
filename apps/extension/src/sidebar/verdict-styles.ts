import type { Verdict } from "@argus/shared";

// Bible §6.1 wireframe shows a color-coded verdict badge; §5.2 defines the
// 5-state enum. Centralized here so every component (card, queue item,
// action buttons) renders identical colors for the same verdict.
export const VERDICT_LABEL: Record<Verdict, string> = {
  STRONG_YES: "STRONG YES",
  YES: "YES",
  WAIT: "WAIT",
  PASS: "PASS",
  HARD_PASS: "HARD PASS",
};

export const VERDICT_CLASSES: Record<Verdict, { badge: string; text: string; ring: string }> = {
  STRONG_YES: { badge: "bg-emerald-600", text: "text-emerald-700", ring: "ring-emerald-200" },
  YES: { badge: "bg-green-500", text: "text-green-700", ring: "ring-green-200" },
  WAIT: { badge: "bg-amber-500", text: "text-amber-700", ring: "ring-amber-200" },
  PASS: { badge: "bg-orange-500", text: "text-orange-700", ring: "ring-orange-200" },
  HARD_PASS: { badge: "bg-red-600", text: "text-red-700", ring: "ring-red-200" },
};
