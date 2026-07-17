import express from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { corsAllowedOrigins } from "./config/env.js";
import { isOriginAllowed } from "./lib/cors.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { metrics } from "./middleware/metrics.js";
import { decisionRouter } from "./modules/decisions/decision.routes.js";
import { outcomeRouter } from "./modules/outcomes/outcome.routes.js";
import { queueRouter } from "./modules/queue/queue.routes.js";
import { integrationRouter } from "./modules/integrations/integration.routes.js";
import { webhookRouter } from "./modules/webhooks/webhook.routes.js";
import { memoryRouter } from "./modules/memory/memory.routes.js";
import { preferencesRouter } from "./modules/preferences/preferences.routes.js";
import { icpRouter } from "./modules/icp/icp.routes.js";
import { policyRouter } from "./modules/policy/policy.routes.js";
import { leadRouter } from "./modules/leads/lead.routes.js";
import { teamRouter } from "./modules/teams/team.routes.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: (origin, callback) => {
        // Bible §19.1 "CORS allows only approved origins" — see lib/cors.ts
        // for exactly how chrome-extension:// vs. https:// origins are
        // matched differently, and why an exact match matters for the
        // latter.
        if (!origin) {
          callback(null, true);
          return;
        }
        const allowed = isOriginAllowed(origin, corsAllowedOrigins);
        callback(allowed ? null : new Error("Origin not allowed by CORS"), allowed);
      },
      credentials: true,
    }),
  );

  // Mounted before every route (including the webhook router below, which
  // sends its own response before express.json() even runs) so infra
  // metrics cover every request this process handles, not just the ones
  // reaching the JSON-bodied API routes.
  app.use(metrics);

  // Mounted before express.json(): Svix signature verification needs the
  // exact raw bytes Clerk sent, which a JSON body parser would have
  // already consumed and re-serialized by the time this route saw it.
  app.use("/api/v1/webhooks", webhookRouter);

  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "argus-api", version: "3.0.0" });
  });

  app.use("/api/v1/decisions", decisionRouter);
  app.use("/api/v1/outcomes", outcomeRouter);
  app.use("/api/v1/queue", queueRouter);
  app.use("/api/v1/integrations", integrationRouter);
  app.use("/api/v1/memory", memoryRouter);
  app.use("/api/v1/preferences", preferencesRouter);
  app.use("/api/v1/icp", icpRouter);
  app.use("/api/v1/policy", policyRouter);
  app.use("/api/v1/leads", leadRouter);
  app.use("/api/v1/teams", teamRouter);

  app.use(errorHandler);

  return app;
}
