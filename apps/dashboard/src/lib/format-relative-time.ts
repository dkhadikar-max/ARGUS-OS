// No existing relative-time utility elsewhere in this codebase when
// ShadowHealthCard.tsx first needed one -- small local pure formatter,
// extracted here in Gate 3 Increment 1.9 so ShadowLiveHealthPanel.tsx can
// reuse it instead of duplicating it verbatim. Rounded to the nearest
// whole unit; "Never" for a null timestamp.
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diffSec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}
