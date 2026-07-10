import * as Sentry from "@sentry/node";
import { env } from "../config/env.js";

// Bible §18 INF-2 "Sentry error tracking" (P0). No-ops safely without a
// real DSN — same pattern as every other external-service credential in
// this codebase (CLERK_WEBHOOK_SECRET, INTERNAL_SERVICE_TOKEN, etc.).
export function initSentry(): void {
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!env.SENTRY_DSN) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
