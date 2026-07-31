import Link from "next/link";
import { api, isForbiddenError } from "../../../../lib/api-client";
import { AdminAccessRequiredPanel } from "../../../../components/AdminAccessRequiredPanel";
import { DecisionExplorerTabs } from "../../../../components/DecisionExplorerTabs";
import type { AdminShadowDecisionDetailResponse } from "@argus/shared";

// This app's first dynamic route (params: Promise<{id}>, matching the
// searchParams: Promise<...> convention already used on queue/analytics).
export default async function ShadowDecisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail: AdminShadowDecisionDetailResponse;
  try {
    detail = await api.getShadowDecisionDetail(id);
  } catch (err) {
    if (isForbiddenError(err)) return <AdminAccessRequiredPanel />;
    throw err;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/admin/shadow-decisions" className="text-sm font-medium text-teal-700 hover:underline">
        ← Shadow Decisions
      </Link>
      <header className="mb-6 mt-2">
        <h1 className="text-lg font-bold text-gray-900">Decision Explorer</h1>
        <p className="mt-1 text-sm text-gray-500">
          {detail.teamName} · prospect {detail.prospectId}
        </p>
      </header>

      <DecisionExplorerTabs detail={detail} />
    </main>
  );
}
