import type { NextFunction, Request, Response } from "express";
import { increment, timing } from "../lib/datadog.js";

// Bible §18 INF-2 -- per-request infra metrics (latency, throughput,
// error rate), the piece Sentry (errors with stack traces) and PostHog
// (product events) don't cover. Tagged by route pattern (`req.route.path`,
// e.g. "/:id/action"), not the raw path with real decision/prospect IDs
// substituted in -- an unbounded set of per-ID tags is exactly the
// high-cardinality-tag problem Datadog's own docs warn against. `req.route`
// is only populated once Express has matched a route, but this reads it
// inside `res.on("finish", ...)`, which fires after that match has already
// happened.
export function metrics(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
    const tags = { method: req.method, route, status: String(res.statusCode) };

    timing("http.request.duration", durationMs, tags);
    increment("http.request.count", tags);
    if (res.statusCode >= 500) {
      increment("http.request.errors", tags);
    }
  });

  next();
}
