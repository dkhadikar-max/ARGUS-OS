# ARGUS AI

The Decision Operating System for B2B Revenue Teams. See the Product Bible (v3.0) for the full spec — this file only covers running the code in this repo.

## Structure

```
packages/database   Prisma schema + generated client (Bible §9.1)
packages/shared      Zod contracts shared by every app (Bible §8, §10)
apps/api             Express API + Claude multi-agent decision engine (Bible §7, §8, §10)
apps/extension       Chrome MV3 extension — LinkedIn sidebar (Bible §6.1, §18 Epic 1)
apps/slack-bot       Bolt.js Socket Mode bot — alerts, outcome nudges, /argus-queue (Bible §6.4, §18 Epic 3)
apps/dashboard       Next.js 16 App Router + Clerk + Today Queue (Bible §6.2, §18 Epic 5)
```

## Prerequisites

- Node.js >= 20
- PostgreSQL 15 and Redis 7, reachable locally (this machine has no Docker, so install them natively — see below)
- An Anthropic API key

### Installing Postgres + Redis natively on Windows

Docker wasn't available when this repo was scaffolded. Until it is, install both as native services:

- **PostgreSQL**: install via the [EnterpriseDB installer](https://www.postgresql.org/download/windows/), or `winget install PostgreSQL.PostgreSQL`. Create a database named `argus`.
- **Redis**: native Windows builds aren't officially maintained by Redis; the simplest options are `winget install Memurai.Memurai` (Redis-compatible, runs as a Windows service) or WSL2 with `apt install redis-server`.

Once either is running, set `DATABASE_URL` / `REDIS_URL` in `apps/api/.env` (copy from `.env.example` at the repo root) to point at them, then run:

```
npm run db:migrate    # applies packages/database/prisma/schema.prisma
```

If Docker becomes available later, a `docker-compose.yml` for Postgres+Redis is the natural next addition — nothing in the code assumes native install specifically.

## Setup

```
npm install
npm run db:generate   # generates the Prisma client
npm run build         # builds packages/database and packages/shared first (dependency order), then apps/*
```

## Running

```
npm run dev:api        # apps/api in watch mode (tsx)
npm run dev --workspace=@argus/slack-bot   # Slack Bot in watch mode
npm run dev --workspace=@argus/dashboard   # Dashboard on http://localhost:3000
```

The Chrome extension is loaded unpacked from `apps/extension/dist` after `npm run build --workspace=@argus/extension` (or `npm run dev --workspace=@argus/extension` for HMR during development): open `chrome://extensions`, enable Developer Mode, "Load unpacked", select that folder.

### Connecting Clerk (required before any real sign-in works)

Every JWT-authenticated request (`middleware/auth.ts`) looks up a `User` row by treating the Clerk JWT's `sub` claim as that row's `id` directly — but nothing creates that row except the webhook below, so **no surface (extension, Slack, dashboard) can have a real signed-in user until this is set up**:

1. In the Clerk Dashboard, add a webhook endpoint pointing at `POST /api/v1/webhooks/clerk`, subscribed to `user.created` and `user.updated`. Copy its signing secret into `CLERK_WEBHOOK_SECRET`.
2. On `user.created`, ARGUS auto-provisions a personal FREE-tier `Team` for the new user (Bible has no "create your team" onboarding wireframe — this is the standard solo-signup pattern, matching the Founder Sam persona in §4.3) and creates the `User` row with `id` set to Clerk's user id.
3. `user.deleted` is intentionally not implemented yet — see Known gaps.

The dashboard additionally needs its own Clerk SDK credentials (distinct from the JWT-verification config above) in `apps/dashboard/.env.local`: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`, from the same Clerk Dashboard's API Keys page. Without real values, `next dev`/`next build` still run, but every page 500s with `@clerk/backend: Missing publishableKey` — an honest, correct failure mode, not a bug to paper over with a fake-looking key.

### Connecting Slack

The Slack Bot serves every connected team from one process (Bible §18 Epic 3), resolving each incoming event's workspace to an ARGUS team via `apps/api`'s `/api/v1/integrations/slack/*` endpoints — no per-workspace OAuth "Add to Slack" flow yet (see Known gaps below). To connect a team today:

1. Create a Slack app (Socket Mode enabled) and note its bot token (`xoxb-...`), bot user id, and app-level token (`xapp-...`).
2. As a team admin (JWT-authenticated, `ADMIN`/`FOUNDER`/`MANAGER` role), `POST /api/v1/integrations/slack` with `{ slackTeamId, botToken, botUserId, alertChannelId }` — the response's `apiKey` is shown once, but the Slack Bot doesn't need it manually; it's stored server-side and resolved automatically per event.
3. Each rep runs `/argus link` in Slack once, so button clicks and outcome logging attribute correctly to their ARGUS user.

### Decision caching (Bible §18 AI-5)

`POST /api/v1/decisions` caches the Claude agent-debate output (not the final API response) in Redis, keyed `decision:{prospectId}:{teamId}:{icpVersion}` with a 24h TTL, exactly matching the Bible §9.2 Redis schema. A cache hit skips the ~$0.04-0.06, multi-second Claude call entirely, but still creates its own `Decision` row — each request is its own auditable event even when the underlying AI analysis is reused. Invalidation: logging an outcome invalidates the cache for that prospect (new ground truth the cached debate didn't have); an ICP edit doesn't need active invalidation since a new `icpVersion` is simply a cache miss by construction, so stale-version entries just expire via the TTL instead of being purged.

### Known gaps (flagged, not hidden)

- No self-serve "Add to Slack" OAuth flow — connecting a workspace requires the manual API call above (§18 SLK-1's "OAuth installation flow" is the natural next task).
- No `ActionTaken` REST endpoint (the model exists in §9.1, but §10 never contracts it) — "accept verdict" is acknowledged locally in both the extension and the Slack bot without a durable record.
- Slack message edits (`Edit First`) aren't persisted server-side, matching the extension's own client-local edit behavior.
- The Full Debate View (§6.5) is an explicit P1 roadmap item — Slack's "View More" shows expanded evidence, not the full 5-agent debate.
- `Integration.config` stores the Slack bot token and a generated API key in plaintext JSON — Bible §18 INF-4 ("Data encryption at rest") is an explicit, not-yet-built P1 item.
- Clerk's `user.deleted` webhook is logged, not acted on — hard-deleting would violate the Decision/Outcome/MessageDraft foreign keys against that user, and a real implementation needs a GDPR-safe anonymization strategy (Bible §16.1 Risk #7, itself an explicit not-yet-built item).
- The dashboard's Today Queue page has no filter/sort controls yet (Bible §18 DSH-2's "Filter and sort controls" is an explicit P1 item) and no Analytics/Company Memory/Settings pages (DSH-3/4/5, mostly P1/P2).
- Queue item cards link out to the prospect's real LinkedIn profile instead of wiring up the wireframe's View/Message/Snooze buttons — those need the same ActionTaken write path noted above, which doesn't exist yet.
- A transitive `postcss` vulnerability (GHSA-qx2v-qp2m-jg93) ships inside Next.js's own vendored dependency (`next/node_modules/postcss`) with no fix currently available upstream — not introduced by this codebase and not safely fixable without downgrading Next.js.

## Testing

```
npm run test           # runs every workspace's Vitest suite
```

Tests mock Prisma/Redis/the Anthropic SDK at the module boundary, so the full suite runs without a live database, cache, or API key — useful in CI or on a machine without Postgres/Redis installed. There is currently no integration test suite against a real database; that's the natural next addition once local Postgres is available.

## Typecheck

```
npm run typecheck       # strict tsc --noEmit across every workspace
```

**Order matters on a fresh checkout**: `packages/database` and `packages/shared` publish their types from `dist/` (see their `package.json` "types" fields), which doesn't exist until they're built. Run `npm run build` before `npm run typecheck` — confirmed by deleting every `dist/` and reproducing the failure before fixing the CI step order below.

## Continuous Integration

`.github/workflows/ci.yml` runs on every push/PR to `main`/`master`: `npm ci` → `npm run build` (in that order, for the reason above) → `npm run typecheck` → `npm run test`. No secrets or external services required — the whole pipeline runs green with zero configuration, the same way it does on this machine with no live Postgres/Redis/Clerk/Slack credentials.

Bible §18 INF-3 also calls for a staging environment; that's blocked on the same thing as INF-1 (Railway/Vercel deploy config) and INF-2 (Sentry/PostHog wiring) — real hosting/observability accounts this environment doesn't have. The workflow itself has no such dependency and is fully built.
