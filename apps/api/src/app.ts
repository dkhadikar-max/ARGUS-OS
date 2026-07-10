import express from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { corsAllowedOrigins } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { decisionRouter } from "./modules/decisions/decision.routes.js";
import { outcomeRouter } from "./modules/outcomes/outcome.routes.js";
import { queueRouter } from "./modules/queue/queue.routes.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: (origin, callback) => {
        // Bible §19.1 "CORS allows only approved origins". Chrome extension
        // origins are `chrome-extension://<id>`; we match by prefix since
        // the extension ID is fixed per-build but configured via env.
        if (!origin) {
          callback(null, true);
          return;
        }
        const allowed = corsAllowedOrigins.some((entry) => origin.startsWith(entry));
        callback(allowed ? null : new Error("Origin not allowed by CORS"), allowed);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "argus-api", version: "3.0.0" });
  });

  app.use("/api/v1/decisions", decisionRouter);
  app.use("/api/v1/outcomes", outcomeRouter);
  app.use("/api/v1/queue", queueRouter);

  app.use(errorHandler);

  return app;
}
