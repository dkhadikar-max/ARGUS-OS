import Link from "next/link";
import { Card } from "@tremor/react";
import type { AdminShadowHealthResponse } from "@argus/shared";

const BREAKER_LABEL: Record<AdminShadowHealthResponse["circuitBreakerState"], string> = {
  closed: "Healthy",
  half_open: "Recovering",
  open: "Open",
};

const BREAKER_CLASSES: Record<AdminShadowHealthResponse["circuitBreakerState"], string> = {
  closed: "text-emerald-700",
  half_open: "text-amber-600",
  open: "text-red-600",
};

// No existing relative-time utility in this codebase -- small local pure
// formatter. Rounded to the nearest whole unit; "Never" for a null
// lastDecisionAt (no shadow decisions recorded yet for this scope).
function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diffSec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

// Gate 3 Increment 1.7 -- gives an operator an immediate answer to "is
// Shadow Mode actually healthy?" without opening charts. circuitBreakerState
// and recentErrorCount1h are per-instance snapshots (see api response's own
// documented limitation) -- surfaced in the caption below, not just in code
// comments, so an operator running multiple apps/api instances isn't misled
// into reading this as a global view.
//
// Gate 3 Increment 1.8 revision (post-review): this card is a cross-tenant
// health view, so "Global %" always shows the real global rollout percent
// -- never a per-team resolved "effective" percent, which would be
// ambiguous here (which team's number would it even be?). Exceptions to
// the global rule are surfaced honestly as a count instead, linking to the
// Rollout Controller page for the actual per-team breakdown.
export function ShadowHealthCard({ health }: { health: AdminShadowHealthResponse }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Shadow Mode</h2>
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <span className={`h-2 w-2 rounded-full ${health.enabled ? "bg-emerald-500" : "bg-gray-300"}`} />
          <span className={health.enabled ? "text-emerald-700" : "text-gray-500"}>
            {health.enabled ? "Enabled" : "Disabled"}
          </span>
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-gray-500">Global %</dt>
          <dd className="mt-0.5 text-sm font-medium text-gray-900">{health.globalPercent}%</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Overrides</dt>
          <dd className="mt-0.5 text-sm font-medium text-gray-900">
            {health.activeOverrideCount > 0 ? (
              <Link href="/admin/shadow-rollout" className="text-teal-700 hover:underline">
                {health.activeOverrideCount} active
              </Link>
            ) : (
              "None"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Last decision</dt>
          <dd className="mt-0.5 text-sm font-medium text-gray-900">{formatRelativeTime(health.lastDecisionAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Agreement (24h)</dt>
          <dd className="mt-0.5 text-sm font-medium text-gray-900">
            {health.totalShadowDecisions24h === 0 ? "No data yet" : `${Math.round(health.verdictAgreementRate24h * 100)}%`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Errors (1h)</dt>
          <dd className="mt-0.5 text-sm font-medium text-gray-900">{health.recentErrorCount1h}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Circuit breaker</dt>
          <dd className={`mt-0.5 text-sm font-medium ${BREAKER_CLASSES[health.circuitBreakerState]}`}>
            {BREAKER_LABEL[health.circuitBreakerState]}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-gray-400">
        Circuit breaker and error counts are a per-instance snapshot, not a cross-instance global view.
      </p>
    </Card>
  );
}
