"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminShadowLiveMetricsResponse } from "@argus/shared";
import { RolloutPercentBar } from "./RolloutPercentBar";
import { Card } from "./ui/Card";
import { formatRelativeTime } from "../lib/format-relative-time";
import { getShadowLiveMetricsAction } from "../app/admin/shadow-health/actions";

// Gate 3 Increment 1.9 -- "the page you watch during rollout." Confirmed
// with the user: lightweight client-side polling (plain HTTP via a Server
// Action, no websockets/SSE/Redis), not manual-refresh-only, paused while
// the tab isn't visible.
const POLL_INTERVAL_MS = 15_000;

const BREAKER_LABEL: Record<AdminShadowLiveMetricsResponse["circuitBreakerState"], string> = {
  closed: "Healthy",
  half_open: "Recovering",
  open: "Open",
};

// Design System Pass (2026-08-01) -- swapped off default Tailwind
// emerald/amber/red onto the brand's signal/caution/alert tokens.
const BREAKER_CLASSES: Record<AdminShadowLiveMetricsResponse["circuitBreakerState"], string> = {
  closed: "text-teal-700",
  half_open: "text-caution",
  open: "text-alert",
};

// Post-review addition -- an operator unfamiliar with circuit breakers
// can't tell whether "half-open" is good or bad from the label alone.
const BREAKER_DESCRIPTION: Record<AdminShadowLiveMetricsResponse["circuitBreakerState"], string> = {
  closed: "Requests flowing normally.",
  open: "Failing — requests rejected immediately to protect the system.",
  half_open: "Testing recovery after previous failures.",
};

function formatMs(ms: number | null): string {
  if (ms === null) return "No data yet";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function formatThresholdSeconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

function formatRate(rate: number | null): string {
  if (rate === null) return "No data yet";
  return `${(rate * 100).toFixed(1)}%`;
}

export function ShadowLiveHealthPanel({ initialMetrics }: { initialMetrics: AdminShadowLiveMetricsResponse }) {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date().toISOString());
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Post-review addition -- "Updated Xs ago" alone can't tell an operator
  // whether the page has genuinely gone quiet or polling is simply paused
  // because the tab isn't visible. Surfaced explicitly instead.
  const [paused, setPaused] = useState(() => typeof document !== "undefined" && document.hidden);
  // Drives the "Updated Xs ago" text between refreshes -- otherwise it
  // would only change once per 15s poll instead of ticking every second.
  const [, forceTick] = useState(0);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const outcome = await getShadowLiveMetricsAction();
    setRefreshing(false);
    if (outcome.ok) {
      setMetrics(outcome.metrics);
      setLastRefreshedAt(new Date().toISOString());
      setStale(false);
    } else {
      // Keep showing the last-known-good metrics, just flag them as stale
      // -- a transient poll failure must never crash or blank the page.
      setStale(true);
    }
  }, []);

  useEffect(() => {
    const poll = setInterval(() => {
      if (document.hidden) return;
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [refresh]);

  useEffect(() => {
    const tick = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      setPaused(document.hidden);
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <span className={`h-2 w-2 rounded-full ${metrics.enabled ? "bg-teal-600" : "bg-gray-300"}`} />
            <span className={metrics.enabled ? "text-teal-700" : "text-gray-500"}>
              {metrics.enabled ? "Shadow mode ON" : "Shadow mode OFF"}
            </span>
          </span>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {stale && <span className="font-medium text-caution">Last refresh failed — showing last known values</span>}
            <span>Updated {formatRelativeTime(lastRefreshedAt)}</span>
            <span className={paused ? "font-medium text-caution" : undefined}>
              {paused ? "Paused — tab hidden" : "Polling every 15s"}
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="rounded border border-gray-300 px-2 py-1 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              {refreshing ? "Refreshing…" : "Refresh now"}
            </button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-gray-500">Sample rate</dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900">{metrics.globalPercent}%</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Circuit breaker</dt>
            <dd className={`mt-0.5 text-sm font-medium ${BREAKER_CLASSES[metrics.circuitBreakerState]}`}>
              {BREAKER_LABEL[metrics.circuitBreakerState]}
            </dd>
            <p className="mt-0.5 text-xs text-gray-400">{BREAKER_DESCRIPTION[metrics.circuitBreakerState]}</p>
          </div>
          <div>
            <dt className="text-xs text-gray-500">P95 latency (1h)</dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900">{formatMs(metrics.p95LatencyMs1h)}</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-gray-900">Concurrency</h2>
        <div className="mt-3">
          <RolloutPercentBar
            percent={metrics.maxConcurrent > 0 ? Math.round((metrics.inFlightCount / metrics.maxConcurrent) * 100) : 0}
            label="In-flight shadow runs"
          />
          <p className="mt-1 text-xs text-gray-500">
            {metrics.inFlightCount} of {metrics.maxConcurrent} slots in use
          </p>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-gray-900">Last hour</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-gray-500">Timeouts</dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900">
              {metrics.timeoutCount1h}
              <span className="ml-1 text-xs font-normal text-gray-400">
                ({formatThresholdSeconds(metrics.timeoutThresholdMs)} threshold)
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Drops</dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900">{metrics.dropCount1h}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-gray-500">Error rate</dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900">
              {formatRate(metrics.errorRate1h)}
              {metrics.errorRate1h !== null && (
                <span className="ml-1 text-xs font-normal text-gray-400">
                  ({metrics.errorCount1h} of {metrics.totalAttempted1h} attempted)
                </span>
              )}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-gray-900">Queue</h2>
        <p className="mt-1 text-xs text-gray-500">
          {metrics.hasQueue
            ? "A queue exists."
            : "No queue — shadow mode drops excess sampled runs instead of queuing (see Drops above)."}
        </p>
      </Card>

      <p className="text-xs text-gray-400">
        In-flight count, circuit breaker state, and the last hour's timeout/drop/error counts (and therefore error
        rate) are a per-instance snapshot, not a cross-instance global view — see the sample rate and P95 latency
        above for the fields that stay accurate across multiple apps/api instances.
      </p>
    </div>
  );
}
