import { api, isForbiddenError } from "../../../lib/api-client";
import { AdminAccessRequiredPanel } from "../../../components/AdminAccessRequiredPanel";
import { AdminSubNav } from "../../../components/AdminSubNav";
import { ShadowLiveHealthPanel } from "../../../components/ShadowLiveHealthPanel";
import type { AdminShadowLiveMetricsResponse } from "@argus/shared";

// Gate 3 Increment 1.9 -- "the page you watch during rollout." The
// Server Component does the initial fetch (same 403-handling convention
// as /admin/analytics and /admin/shadow-rollout), then hands the data to
// a Client Component that polls for subsequent refreshes.
export default async function ShadowHealthPage() {
  let metrics: AdminShadowLiveMetricsResponse;
  try {
    metrics = await api.getShadowLiveMetrics();
  } catch (err) {
    if (isForbiddenError(err)) return <AdminAccessRequiredPanel />;
    throw err;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <AdminSubNav />
      <header className="mb-6">
        <h1 className="text-lg font-bold text-gray-900">Shadow Health</h1>
        <p className="mt-1 text-sm text-gray-500">
          Live operational state, not history — sample rate, concurrency, circuit breaker, and the last hour's
          timeouts/drops/errors. Refreshes automatically every 15 seconds while this tab is open.
        </p>
      </header>

      <ShadowLiveHealthPanel initialMetrics={metrics} />
    </main>
  );
}
