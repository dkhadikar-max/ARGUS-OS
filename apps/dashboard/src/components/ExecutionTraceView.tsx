"use client";

import { useState } from "react";

// Narrow, defensive projection of apps/api's real ExecutionTrace shape
// (apps/api/src/agents/execution-trace.ts) -- executionTrace travels as
// `unknown` end-to-end (stored as Json, typed z.unknown() in the shared
// schema), so every field is read defensively rather than assumed present.
interface StageTiming {
  stage: string;
  latencyMs: number;
}

interface ParsedTrace {
  timings?: StageTiming[];
}

function parseTrace(executionTrace: unknown): ParsedTrace {
  if (!executionTrace || typeof executionTrace !== "object") return {};
  const t = executionTrace as Record<string, unknown>;
  const timings = Array.isArray(t.timings)
    ? t.timings.filter(
        (x): x is StageTiming =>
          typeof x === "object" && x !== null && typeof (x as StageTiming).stage === "string" && typeof (x as StageTiming).latencyMs === "number",
      )
    : undefined;
  return { timings };
}

interface Props {
  executionId: string;
  controllerAction: string;
  controllerTargetCapability: string | null;
  controllerReasons: string[];
  executionTrace: unknown;
}

// Per feedback: full raw execution traces are postponed behind a "Show raw
// trace" toggle to reduce operator cognitive load -- the default view is a
// short summary built from real fields (executionId, per-stage latencies
// from executionTrace.timings when present, and the controller decision --
// the latter reused from ShadowDecision's own top-level fields, not parsed
// out of the trace blob).
export function ExecutionTraceView({
  executionId,
  controllerAction,
  controllerTargetCapability,
  controllerReasons,
  executionTrace,
}: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const { timings } = parseTrace(executionTrace);

  async function handleCopy() {
    await navigator.clipboard.writeText(JSON.stringify(executionTrace, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Execution summary</h3>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Execution ID</dt>
          <dd className="font-mono text-xs text-gray-800">{executionId}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Controller action</dt>
          <dd className="text-gray-800">
            {controllerAction}
            {controllerTargetCapability ? ` → ${controllerTargetCapability}` : ""}
          </dd>
        </div>
      </dl>

      {controllerReasons.length > 0 && (
        <ul className="mt-2 space-y-1">
          {controllerReasons.map((reason, i) => (
            <li key={i} className="rounded border-l-2 border-gray-300 bg-gray-50 p-2 text-xs text-gray-700">
              {reason}
            </li>
          ))}
        </ul>
      )}

      {timings && timings.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Stage durations</p>
          <ul className="mt-1 space-y-1">
            {timings.map((t) => (
              <li key={t.stage} className="flex justify-between text-xs text-gray-700">
                <span>{t.stage}</span>
                <span>{t.latencyMs}ms</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {executionTrace == null ? (
        <p className="mt-3 text-xs text-gray-400">No execution trace recorded.</p>
      ) : (
        <details className="mt-3" open={showRaw} onToggle={(e) => setShowRaw(e.currentTarget.open)}>
          <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span>Show raw trace</span>
            {showRaw && (
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
            {JSON.stringify(executionTrace, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
