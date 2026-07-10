import "dotenv/config";
import { z } from "zod";

// Loads apps/slack-bot/.env — see apps/api/src/config/env.ts for why.

// Bible §18 Epic 3, §7.2 "Socket Mode avoids public URL requirements".
// No per-workspace bot token lives here — those are resolved per-event via
// apps/api's integration-resolution endpoint (see lib/team-resolver.ts),
// since one Slack Bot process serves every connected ARGUS team.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  SLACK_APP_TOKEN: z.string().min(1, "SLACK_APP_TOKEN (xapp-...) is required for Socket Mode"),
  SLACK_SIGNING_SECRET: z.string().min(1, "SLACK_SIGNING_SECRET is required"),

  API_BASE_URL: z.string().min(1).default("http://localhost:4000"),
  INTERNAL_SERVICE_TOKEN: z.string().min(1, "INTERNAL_SERVICE_TOKEN must match apps/api's value"),

  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
