"use client";

import { useState } from "react";

interface Props {
  title: string;
  agentOutputs: unknown;
}

// Reused for both the live and shadow sides. Native HTML only -- no
// JSON-viewer dependency (this codebase has none and doesn't need one for
// this). Collapsed by default (a medium-sized agent output can be
// thousands of lines), with a copy-to-clipboard button and a
// max-height/scroll box on the raw JSON so expanding it never grows the
// page unbounded.
export function AgentOutputsView({ title, agentOutputs }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (agentOutputs == null) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
        <p className="mt-2 text-xs text-gray-400">No agent output recorded.</p>
      </div>
    );
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(JSON.stringify(agentOutputs, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
          <span>{title}</span>
          {open && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                void handleCopy();
              }}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium normal-case text-gray-700 hover:bg-gray-50"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
        </summary>
        <pre className="mt-2 max-h-96 overflow-y-auto rounded bg-gray-50 p-2 text-xs text-gray-800">
          {JSON.stringify(agentOutputs, null, 2)}
        </pre>
      </details>
    </div>
  );
}
