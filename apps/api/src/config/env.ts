import "dotenv/config";
import { z } from "zod";

// Loads apps/api/.env (dotenv resolves relative to process.cwd(), which is
// this workspace's directory whether run via `npm run dev --workspace=
// @argus/api` or directly). No-ops silently if the file doesn't exist —
// e.g. in production, where real env vars are injected by the platform.

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
  // Verifies POST /api/v1/webhooks/clerk (Svix signatures) — this is how
  // User rows actually get created with id = Clerk's user id, which
  // authenticateWithJwt's `prisma.user.findUnique({ where: { id: userId } })`
  // depends on already existing (see middleware/auth.ts).
  CLERK_WEBHOOK_SECRET: z.string().optional(),

  // Shared secret between apps/api and apps/slack-bot for the
  // server-to-server Slack integration-resolution endpoint (Bible §18
  // Epic 3) — never sent by end users, so it doesn't fit the Bearer/
  // x-api-key schemes in §10.1, which are both end-user-facing.
  INTERNAL_SERVICE_TOKEN: z.string().min(16, "INTERNAL_SERVICE_TOKEN must be set (>=16 chars) for the Slack Bot integration endpoints").optional(),

  CORS_ALLOWED_ORIGINS: z.string().default(""),

  RATE_LIMIT_FREE_PER_HOUR: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_PAID_PER_HOUR: z.coerce.number().int().positive().default(500),

  SENTRY_DSN: z.string().optional(),

  // Bible §18 INF-2 "PostHog event tracking" — see lib/analytics.ts. Both
  // optional: analytics no-ops safely when unset, same pattern as every
  // other external-service credential in this schema.
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().default("https://app.posthog.com"),

  // Bible §18 SLK-1 "Add to Slack" self-serve OAuth install (P0), replacing
  // the manual paste-a-token connectSlack flow as the primary path. Optional
  // like every other third-party credential — the /slack/install endpoint
  // throws a clear error if these are unset rather than failing boot.
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  // This server's own public-facing URL, needed to build the redirect_uri
  // Slack sends the browser back to after consent. Must exactly match a
  // redirect URL configured in the Slack App's "OAuth & Permissions" page.
  PUBLIC_API_URL: z.string().default("http://localhost:4000"),
  // Where the OAuth callback sends the browser after connecting (success or
  // failure) — the dashboard's Today Queue page.
  DASHBOARD_URL: z.string().default("http://localhost:3000"),

  // Bible §18 INF-4 "Data encryption at rest" (P1). Encrypts Integration.
  // config's secret fields (Slack bot token, generated API key) — see
  // lib/encryption.ts. Optional at the app level (a fresh checkout that
  // never touches Slack integrations still boots fine), but
  // encrypt()/decrypt() throw a clear, loud error if actually invoked
  // without it set, rather than silently falling back to plaintext.
  // Generate with: openssl rand -hex 32
  CONFIG_ENCRYPTION_KEY: z
    .string()
    .length(64, "CONFIG_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) — generate with `openssl rand -hex 32`")
    .optional(),
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
