import { StatsD } from "hot-shots";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

// Bible §18 INF-2 "Datadog / Railway metrics" (P1), §17.3's "API uptime
// 99.9% — Datadog" success metric. Sentry (lib/sentry.ts) and PostHog
// (lib/analytics.ts) already cover errors and product events respectively —
// this is the missing third leg: request-level infra metrics (latency,
// throughput, error rate) neither of those track. No-ops safely without a
// real agent host, same pattern as every other external-service credential
// in this codebase.
//
// hot-shots submits over UDP via the StatsD protocol (the Datadog Agent
// listens on 8125 by default) — fire-and-forget by design, so an
// unreachable/misconfigured agent must never throw or block a request.
// `errorHandler` (verified against the installed package's own
// node_modules/hot-shots/types.d.ts, not assumed) is what prevents a socket
// error from becoming an uncaught exception.
const client = env.DATADOG_AGENT_HOST
  ? new StatsD({
      host: env.DATADOG_AGENT_HOST,
      port: env.DATADOG_AGENT_PORT,
      prefix: "argus.api.",
      errorHandler: (err) => logger.warn({ err }, "Datadog StatsD client error"),
    })
  : null;

export function increment(stat: string, tags?: Record<string, string>): void {
  client?.increment(stat, tags);
}

export function timing(stat: string, durationMs: number, tags?: Record<string, string>): void {
  client?.timing(stat, durationMs, tags);
}

// Not yet wired into a graceful-shutdown hook -- same not-yet-built status
// as lib/analytics.ts's own shutdownAnalytics(), since no SIGTERM handler
// exists in server.ts at all yet.
export function closeDatadog(): Promise<void> {
  return new Promise((resolve) => {
    if (!client) {
      resolve();
      return;
    }
    client.close(() => resolve());
  });
}
