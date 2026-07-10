# ARGUS AI

The Decision Operating System for B2B Revenue Teams. See the Product Bible (v3.0) for the full spec — this file only covers running the code in this repo.

## Structure

```
packages/database   Prisma schema + generated client (Bible §9.1)
packages/shared      Zod contracts shared by every app (Bible §8, §10)
apps/api             Express API + Claude multi-agent decision engine (Bible §7, §8, §10)
apps/extension       Chrome MV3 extension — LinkedIn sidebar (Bible §6.1, §18 Epic 1)
apps/slack-bot       Bolt.js Socket Mode bot — alerts, outcome nudges, /argus-queue (Bible §6.4, §18 Epic 3)
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
```

The Chrome extension is loaded unpacked from `apps/extension/dist` after `npm run build --workspace=@argus/extension` (or `npm run dev --workspace=@argus/extension` for HMR during development): open `chrome://extensions`, enable Developer Mode, "Load unpacked", select that folder.

### Connecting Slack

The Slack Bot serves every connected team from one process (Bible §18 Epic 3), resolving each incoming event's workspace to an ARGUS team via `apps/api`'s `/api/v1/integrations/slack/*` endpoints — no per-workspace OAuth "Add to Slack" flow yet (see Known gaps below). To connect a team today:

1. Create a Slack app (Socket Mode enabled) and note its bot token (`xoxb-...`), bot user id, and app-level token (`xapp-...`).
2. As a team admin (JWT-authenticated, `ADMIN`/`FOUNDER`/`MANAGER` role), `POST /api/v1/integrations/slack` with `{ slackTeamId, botToken, botUserId, alertChannelId }` — the response's `apiKey` is shown once, but the Slack Bot doesn't need it manually; it's stored server-side and resolved automatically per event.
3. Each rep runs `/argus link` in Slack once, so button clicks and outcome logging attribute correctly to their ARGUS user.

### Known gaps (flagged, not hidden)

- No self-serve "Add to Slack" OAuth flow — connecting a workspace requires the manual API call above (§18 SLK-1's "OAuth installation flow" is the natural next task).
- No `ActionTaken` REST endpoint (the model exists in §9.1, but §10 never contracts it) — "accept verdict" is acknowledged locally in both the extension and the Slack bot without a durable record.
- Slack message edits (`Edit First`) aren't persisted server-side, matching the extension's own client-local edit behavior.
- The Full Debate View (§6.5) is an explicit P1 roadmap item — Slack's "View More" shows expanded evidence, not the full 5-agent debate.
- `Integration.config` stores the Slack bot token and a generated API key in plaintext JSON — Bible §18 INF-4 ("Data encryption at rest") is an explicit, not-yet-built P1 item.

## Testing

```
npm run test           # runs every workspace's Vitest suite
```

Tests mock Prisma/Redis/the Anthropic SDK at the module boundary, so the full suite runs without a live database, cache, or API key — useful in CI or on a machine without Postgres/Redis installed. There is currently no integration test suite against a real database; that's the natural next addition once local Postgres is available.

## Typecheck

```
npm run typecheck       # strict tsc --noEmit across every workspace
```
