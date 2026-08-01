"use client";

import { useState } from "react";
import type { AdminShadowRolloutPreviewResponse } from "@argus/shared";
import { previewShadowRolloutAction } from "../app/admin/shadow-rollout/actions";
import { Card } from "./ui/Card";

// Gate 3 Increment 1.8 -- Dry Run Preview. Explains "why was/wasn't this
// prospect shadowed" without guesswork, built on the exact same
// resolution function the live path uses (via previewShadowRolloutAction
// -> the admin preview endpoint -> shadow-rollout.service.ts's
// previewShadowSampling), so it can never disagree with real behavior.
export function ShadowRolloutPreviewTool() {
  const [prospectId, setProspectId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdminShadowRolloutPreviewResponse | null>(null);

  async function handleRun() {
    if (!prospectId.trim() || !teamId.trim()) {
      setError("Both prospect ID and team ID are required");
      return;
    }
    setLoading(true);
    setError(null);
    const outcome = await previewShadowRolloutAction(prospectId.trim(), teamId.trim());
    setLoading(false);
    if (!outcome.ok) {
      setError(outcome.error);
      setResult(null);
      return;
    }
    setResult(outcome.preview);
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-gray-900">Dry run preview</h2>
      <p className="mt-1 text-xs text-gray-500">See exactly why a prospect would or wouldn't be shadowed right now.</p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          type="text"
          placeholder="Prospect ID"
          value={prospectId}
          onChange={(e) => setProspectId(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
        <input
          type="text"
          placeholder="Team ID"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleRun}
        disabled={loading}
        className="mt-3 rounded bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-40"
      >
        {loading ? "Running…" : "Run preview"}
      </button>

      {result && (
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded border border-gray-100 bg-gray-50 p-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-gray-500">Shadow mode</dt>
            <dd className="text-sm font-medium text-gray-900">{result.enabled ? "Enabled" : "Disabled"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Global %</dt>
            <dd className="text-sm font-medium text-gray-900">{result.globalPercent}%</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Override</dt>
            <dd className="text-sm font-medium text-gray-900">{result.override ? `${result.override.percent}%` : "none"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Effective %</dt>
            <dd className="text-sm font-medium text-gray-900">{result.effectivePercent}%</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Hash bucket</dt>
            <dd className="text-sm font-medium text-gray-900">{result.bucket}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Sampled</dt>
            <dd className={`text-sm font-bold ${result.sampled ? "text-emerald-700" : "text-gray-500"}`}>
              {result.sampled ? "YES" : "NO"}
            </dd>
          </div>
        </dl>
      )}
    </Card>
  );
}
