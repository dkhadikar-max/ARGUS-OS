import type { Verdict } from "@argus/shared";

const VERDICT_LABEL: Record<Verdict, string> = {
  STRONG_YES: "STRONG YES",
  YES: "YES",
  WAIT: "WAIT",
  PASS: "PASS",
  HARD_PASS: "HARD PASS",
};

// Design System Pass (2026-08-01) -- was a default-Tailwind traffic-light
// scale (emerald/green/amber/orange/red), unrelated to apps/website's own
// defined verdict tokens for this exact domain concept. Remapped onto the
// brand's verdict scale (teal-glow/teal for the two "yes" tiers, wait
// cyan, pass/hard-pass navy-fade for the two "no" tiers) -- see
// VerdictSpectrumSection.tsx in apps/website for the same mapping. Text
// color is per-verdict, not uniform white: the two brightest fills
// (teal-glow, wait) read poorly with white text, so they pair with navy;
// the two dark navy-fade fills keep white.
const VERDICT_CLASSES: Record<Verdict, string> = {
  STRONG_YES: "bg-teal-glow text-navy",
  YES: "bg-teal-600 text-navy",
  WAIT: "bg-wait text-navy",
  PASS: "bg-pass text-white",
  HARD_PASS: "bg-hard-pass text-white",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold ${VERDICT_CLASSES[verdict]}`}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}
