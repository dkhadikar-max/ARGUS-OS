import { api, isForbiddenError } from "../../../lib/api-client";
import { AdminAccessRequiredPanel } from "../../../components/AdminAccessRequiredPanel";
import { AdminSubNav } from "../../../components/AdminSubNav";
import { ShadowDecisionsTable } from "../../../components/ShadowDecisionsTable";
import type { AdminListShadowDecisionsResponse } from "@argus/shared";

// First admin-tier UI page in this app. All real authorization happens by
// calling the already-requireAdmin-gated Admin API and reacting to the
// response -- proxy.ts's single blanket Clerk gate only proves "signed in",
// nothing role-based.
export default async function ShadowDecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const { offset } = await searchParams;
  const parsedOffset = offset ? Number(offset) : 0;

  let data: AdminListShadowDecisionsResponse;
  try {
    data = await api.getShadowDecisions({ offset: Number.isFinite(parsedOffset) ? parsedOffset : 0 });
  } catch (err) {
    if (isForbiddenError(err)) return <AdminAccessRequiredPanel />;
    throw err;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <AdminSubNav />
      <header className="mb-6">
        <h1 className="text-lg font-bold text-gray-900">Shadow Decisions</h1>
        <p className="mt-1 text-sm text-gray-500">
          Cross-team Shadow Mode monitoring — click a row to open the Decision Explorer.
        </p>
      </header>

      <ShadowDecisionsTable data={data} />
    </main>
  );
}
