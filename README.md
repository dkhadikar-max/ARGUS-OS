# ARGUS AI

The Decision Operating System for B2B Revenue Teams. See the Product Bible (v3.0) for the full spec — this file only covers running the code in this repo.

## Structure

```
packages/database   Prisma schema + generated client (Bible §9.1)
packages/shared      Zod contracts shared by every app (Bible §8, §10)
apps/api             Express API + Claude multi-agent decision engine (Bible §7, §8, §10)
apps/extension       Chrome MV3 extension — LinkedIn sidebar (Bible §6.1, §18 Epic 1)
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
```

The Chrome extension is loaded unpacked from `apps/extension/dist` after `npm run build --workspace=@argus/extension` (or `npm run dev --workspace=@argus/extension` for HMR during development): open `chrome://extensions`, enable Developer Mode, "Load unpacked", select that folder.

## Testing

```
npm run test           # runs every workspace's Vitest suite
```

Tests mock Prisma/Redis/the Anthropic SDK at the module boundary, so the full suite runs without a live database, cache, or API key — useful in CI or on a machine without Postgres/Redis installed. There is currently no integration test suite against a real database; that's the natural next addition once local Postgres is available.

## Typecheck

```
npm run typecheck       # strict tsc --noEmit across every workspace
```
