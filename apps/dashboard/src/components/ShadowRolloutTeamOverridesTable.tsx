"use client";

import { useState } from "react";
import type { AdminShadowRolloutResponse } from "@argus/shared";
import { upsertShadowRolloutTeamOverrideAction, deleteShadowRolloutTeamOverrideAction } from "../app/admin/shadow-rollout/actions";
import { RolloutPercentBar } from "./RolloutPercentBar";
import { Card } from "./ui/Card";

type Override = AdminShadowRolloutResponse["teamOverrides"][number];

function isExpired(expiresAt: string | null): boolean {
  return expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();
}

export function ShadowRolloutTeamOverridesTable({ overrides }: { overrides: Override[] }) {
  const [teamId, setTeamId] = useState("");
  const [percent, setPercent] = useState(100);
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!teamId.trim()) {
      setError("Team ID is required");
      return;
    }
    setPending("add");
    setError(null);
    const result = await upsertShadowRolloutTeamOverrideAction(teamId.trim(), {
      percent,
      reason: reason.trim() || undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
    });
    setPending(null);
    if (!result.ok) {
      setError(result.error ?? "Failed to save team override");
      return;
    }
    setTeamId("");
    setReason("");
    setExpiresAt("");
    setPercent(100);
  }

  async function handleRemove(id: string) {
    setPending(id);
    setError(null);
    const result = await deleteShadowRolloutTeamOverrideAction(id);
    setPending(null);
    if (!result.ok) setError(result.error ?? "Failed to remove team override");
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-gray-900">Team overrides</h2>

      {overrides.length === 0 ? (
        <p className="mt-2 text-xs text-gray-400">No team overrides yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {overrides.map((o) => {
            const expired = isExpired(o.expiresAt);
            return (
              <li key={o.teamId} className="rounded border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {o.teamName} <span className="text-xs text-gray-400">({o.teamId})</span>
                    </p>
                    <div className="mt-1">
                      <RolloutPercentBar percent={o.percent} label={`${o.teamName} rollout percent`} />
                    </div>
                    {o.reason && <p className="mt-1 text-xs text-gray-500">{o.reason}</p>}
                    <p className="mt-1 text-xs text-gray-400">
                      v{o.version} · updated by {o.updatedBy} on {new Date(o.updatedAt).toLocaleDateString()}
                      {o.expiresAt && (
                        <>
                          {" "}
                          ·{" "}
                          <span className={expired ? "font-medium text-red-600" : ""}>
                            {expired ? "Expired" : "Expires"} {new Date(o.expiresAt).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(o.teamId)}
                    disabled={pending === o.teamId}
                    className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    {pending === o.teamId ? "Removing…" : "Remove"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 border-t border-gray-100 pt-4">
        <p className="text-section-label">Add override</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            type="text"
            placeholder="Team ID"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            type="text"
            placeholder="Reason (optional, e.g. a ticket ref)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2"
          />
          <label className="flex items-center gap-2 text-xs text-gray-500 sm:col-span-2">
            Expires (optional)
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </label>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending === "add"}
          className="mt-3 rounded bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-40"
        >
          {pending === "add" ? "Saving…" : "Add override"}
        </button>
      </div>
    </Card>
  );
}
