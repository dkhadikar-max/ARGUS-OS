import pino from "pino";
import { env } from "../config/env.js";

// Bible §19.1 Security checklist: "No PII in logs or error traces" — redact
// known PII-bearing fields at the logger level so no call site can forget.
export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers['x-api-key']",
      "*.email",
      "*.linkedInUrl",
      "*.rawProfile",
    ],
    censor: "[REDACTED]",
  },
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
