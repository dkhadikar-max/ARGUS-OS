import { api, isForbiddenError } from "../../../lib/api-client";
import { AdminAccessRequiredPanel } from "../../../components/AdminAccessRequiredPanel";
import { AdminSubNav } from "../../../components/AdminSubNav";
import { ShadowRolloutConfigForm } from "../../../components/ShadowRolloutConfigForm";
import { ShadowRolloutTeamOverridesTable } from "../../../components/ShadowRolloutTeamOverridesTable";
import { ShadowRolloutPreviewTool } from "../../../components/ShadowRolloutPreviewTool";
import type { AdminShadowRolloutAuditResponse, AdminShadowRolloutResponse } from "@argus/shared";

// Gate 3 Increment 1.8 -- Shadow Rollout Controller. Priority 1 of the
// pre-rollout roadmap: global %, per-team overrides, a DB-backed kill
// switch editable with no restart, a rollout audit log, and a Dry Run
// Preview tool.
export default async function ShadowRolloutPage() {
  let status: AdminShadowRolloutResponse;
  let audit: AdminShadowRolloutAuditResponse;
  try {
    [status, audit] = await Promise.all([api.getShadowRollout(), api.getShadowRolloutAudit({ limit: 20 })]);
  } catch (err) {
    if (isForbiddenError(err)) return <AdminAccessRequiredPanel />;
    throw err;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <AdminSubNav />
      <header className="mb-6">
        <h1 className="text-lg font-bold text-gray-900">Shadow Rollout Controller</h1>
        <p className="mt-1 text-sm text-gray-500">
          Global % + per-team overrides, runtime-editable — no redeploy required. env.SHADOW_MODE_ENABLED
          remains the hard, deploy-time kill switch on top of the toggle below.
        </p>
      </header>

      <div className="space-y-6">
        <ShadowRolloutConfigForm enabled={status.enabled} globalPercent={status.globalPercent} version={status.version} />
        <ShadowRolloutTeamOverridesTable overrides={status.teamOverrides} />
        <ShadowRolloutPreviewTool />

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Recent activity</h2>
          {audit.entries.length === 0 ? (
            <p className="mt-2 text-xs text-gray-400">No changes recorded yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {audit.entries.map((entry) => (
                <li key={entry.id} className="rounded border border-gray-100 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">
                      {entry.entityType} · {entry.action}
                    </span>
                    <span className="text-gray-400">{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-gray-500">
                    {entry.entityId} — by {entry.actorId}
                  </p>
                  {(entry.beforeState != null || entry.afterState != null) && (
                    <p className="mt-1 text-gray-400">
                      {entry.beforeState ? JSON.stringify(entry.beforeState) : "—"} → {entry.afterState ? JSON.stringify(entry.afterState) : "—"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
