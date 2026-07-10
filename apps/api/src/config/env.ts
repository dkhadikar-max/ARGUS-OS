import { z } from "zod";

// Bible §7.2 tech stack + §19.1 security checklist: fail fast at boot rather
// than surfacing a cryptic runtime error the first time a route needs a key.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),

  APOLLO_API_KEY: z.string().optional(),
  CLEARBIT_API_KEY: z.string().optional(),

  CLERK_JWT_ISSUER: z.string().optional(),
  CLERK_JWKS_URL: z.string().optional(),

  // Shared secret between apps/api and apps/slack-bot for the
  // server-to-server Slack integration-resolution endpoint (Bible §18
  // Epic 3) — never sent by end users, so it doesn't fit the Bearer/
  // x-api-key schemes in §10.1, which are both end-user-facing.
  INTERNAL_SERVICE_TOKEN: z.string().min(16, "INTERNAL_SERVICE_TOKEN must be set (>=16 chars) for the Slack Bot integration endpoints").optional(),

  CORS_ALLOWED_ORIGINS: z.string().default(""),

  RATE_LIMIT_FREE_PER_HOUR: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_PAID_PER_HOUR: z.coerce.number().int().positive().default(500),

  SENTRY_DSN: z.string().optional(),
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

export const corsAllowedOrigins = env.CORS_ALLOWED_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
