"use client";

import { useState } from "react";
import { updateShadowRolloutConfigAction } from "../app/admin/shadow-rollout/actions";
import { RolloutPercentBar } from "./RolloutPercentBar";

interface Props {
  enabled: boolean;
  globalPercent: number;
  version: number;
}

export function ShadowRolloutConfigForm({ enabled: initialEnabled, globalPercent: initialPercent, version }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [percent, setPercent] = useState(initialPercent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await updateShadowRolloutConfigAction({ enabled, globalPercent: percent });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Failed to update rollout config");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Global rollout</h2>
        <span className="text-xs text-gray-400">Config v{version}</span>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enabled (dashboard kill switch — SHADOW_MODE_ENABLED must also be on)
      </label>

      <div className="mt-3">
        <label className="block text-xs text-gray-500" htmlFor="global-percent">
          Global percent
        </label>
        <div className="mt-1 flex items-center gap-3">
          <input
            id="global-percent"
            type="number"
            min={0}
            max={100}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
            className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <RolloutPercentBar percent={percent} label="Global rollout percent" />
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-4 rounded bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-40"
      >
        {saving ? "Saving…" : saved ? "Saved!" : "Save"}
      </button>
    </div>
  );
}
