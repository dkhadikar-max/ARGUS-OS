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

### Connecting Slack (Bible §18 SLK-1)

The Slack Bot serves every connected team from one process (Bible §18 Epic 3), resolving each incoming event's workspace to an ARGUS team via `apps/api`'s `/api/v1/integrations/slack/*` endpoints.

**Self-serve OAuth (primary path).** A team admin clicks "Connect Slack" on the dashboard's Today Queue page, which hits `apps/dashboard`'s `/api/slack/install` Route Handler → `GET /api/v1/integrations/slack/install` on `apps/api` (JWT-authenticated, `ADMIN`/`FOUNDER`/`MANAGER` only) → Slack's own consent screen, where the admin also picks the alerts channel (requested via the `incoming-webhook` scope purely for its channel picker — the bot posts through `chat.postMessage`, not the webhook URL itself). Slack redirects back to `GET /api/v1/integrations/slack/oauth/callback`, which is public (no JWT — a single-use, Redis-backed `state` token generated at `/install` is the CSRF/security mechanism instead, 10-minute TTL, deleted on first use). On success this persists the integration *and* links the installing admin's `User.slackUserId` automatically from the OAuth response's `authed_user.id` — they don't need to separately run `/argus link`. Requires `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET` (from the Slack app's OAuth & Permissions page) and `PUBLIC_API_URL` (must exactly match the redirect URL registered there).

**Manual token entry (fallback)** — for workspaces whose Slack admin policy blocks third-party app installs, or for local dev without a public callback URL:

1. Create a Slack app (Socket Mode enabled) and note its bot token (`xoxb-...`), bot user id, and app-level token (`xapp-...`).
2. As a team admin, `POST /api/v1/integrations/slack` with `{ slackTeamId, botToken, botUserId, alertChannelId }` — the response's `apiKey` is shown once, but the Slack Bot doesn't need it manually; it's stored server-side and resolved automatically per event.

Either way, each rep still runs `/argus link` in Slack once *unless* they were the OAuth-installing admin (linked automatically) — this attributes button clicks and outcome logging to their ARGUS user.

### Decision caching (Bible §18 AI-5)

`POST /api/v1/decisions` caches the Claude agent-debate output (not the final API response) in Redis, keyed `decision:{prospectId}:{teamId}:{icpVersion}` with a 24h TTL, exactly matching the Bible §9.2 Redis schema. A cache hit skips the ~$0.04-0.06, multi-second Claude call entirely, but still creates its own `Decision` row — each request is its own auditable event even when the underlying AI analysis is reused. Invalidation: logging an outcome invalidates the cache for that prospect (new ground truth the cached debate didn't have); an ICP edit doesn't need active invalidation since a new `icpVersion` is simply a cache miss by construction, so stale-version entries just expire via the TTL instead of being purged.

### Prospect enrichment (Bible §18 AI-2)

`POST /api/v1/decisions` enriches the prospect's company via Apollo.io (Organization Enrichment) and Clearbit (Company API) before the agent debate runs, populating `Prospect.companySize`/`companyIndustry`/`companyFunding`/`enrichedData` and adding `FIRMOGRAPHIC` evidence rows sourced `APOLLO`/`CLEARBIT` (as distinct from the Research Agent's own `INFERRED` evidence). Both are env-var-gated (`APOLLO_API_KEY`, `CLEARBIT_API_KEY`) and safely no-op without real keys. Re-enrichment is skipped for 30 days per prospect (`Prospect.lastEnrichedAt`) so repeated decisions on the same prospect don't burn API quota on data that barely changes day to day. Per Bible §16.1 Risk #4, a failure from either provider degrades gracefully (logged, not thrown) rather than blocking decision creation — `Promise.allSettled` so one provider's outage never takes the other down with it.

Both providers' exact request/response shapes were verified against real sources rather than assumed, since the Bible only names the integrations without specifying their contracts:
- **Apollo**: fetched directly from `docs.apollo.io` — base URL `https://api.apollo.io/api/v1`, `x-api-key` header auth.
- **Clearbit**: their public docs site is now fully behind a login wall (likely restructured after the 2023 HubSpot acquisition) and their official Node client is archived. Verified instead against that client's actual source code and test fixtures on GitHub — which is how a wrong assumption (`Authorization: Bearer`) got caught and corrected to the real mechanism, HTTP Basic auth with the API key as username and an empty password.

### Observability (Bible §18 INF-2, §11)

`apps/api` wires Sentry error tracking (`lib/sentry.ts`, capturing every 5xx in `middleware/error-handler.ts`) and PostHog event tracking (`lib/analytics.ts`) using the exact event names and properties from Bible §11.1 — the full catalog is typed as a discriminated union in `packages/shared/src/schemas/analytics.ts` so every call site is checked against the Bible's spec at compile time, not just by convention. Both are env-var-gated (`SENTRY_DSN`, `POSTHOG_API_KEY`) and no-op safely without real credentials, same pattern as `CLERK_WEBHOOK_SECRET`/`INTERNAL_SERVICE_TOKEN`. Wired server-side at `verdict_generated`/`verdict_overridden` (decision service), `outcome_logged` (outcome service), `integration_connected` (Slack connect).

`apps/extension` wires client-side PostHog (`lib/analytics.ts`) for `sidebar_opened`, `message_copied`, `message_edited` — the events that only the sidebar UI itself can observe. Manifest V3 forbids remote-hosted or eval'd code, and posthog-js's default build lazy-loads session-replay/surveys/feature-flag code from PostHog's CDN at runtime, which would violate that outright. Rather than assume this was fine, it was verified against PostHog's own docs before writing any code: importing from `posthog-js/dist/module.slim.no-external` pre-bundles everything at build time (Vite inlines it into the content script, so there's no runtime `script-src` violation possible), and "slim" (not "full") was chosen after comparing actual built file sizes in `node_modules/posthog-js/dist` — slim is ~119KB vs. full's ~522KB, since Bible §11.1's events don't need any of the session-replay/surveys/feature-flag code "full" bundles in regardless. The built extension bundle was then inspected directly (`grep` for `eval(`, dynamic `createElement('script')`, and PostHog CDN URL patterns) to confirm empirically, not just by trusting the package name, that no remote-script-loading code made it into the shipped output.

**Two dependency-pinning notes**: `posthog-node` is pinned to the exact version `5.21.0` (not `^5.21.0`) because every version from `5.22.0` onward declares `engines.node: "^20.20.0 || >=22.22.0"` — this machine runs `20.19.4`, one patch version below that floor. `posthog-js` is similarly pinned to the exact `1.399.2` verified against, rather than a caret range, since the `dist/module.slim.no-external` subpath's internal behavior isn't part of any documented semver contract.

Not yet wired: `queue_viewed`/`queue_item_clicked` in the dashboard, and the extension's own `sidebar_opened`/etc. have no live end-to-end verification against a real LinkedIn page (this environment can't load an unpacked extension against a live page) — verified instead via typecheck, a real `vite build`, unit tests mocking posthog-js, and direct inspection of the built bundle.

### Known gaps (flagged, not hidden)

- No `ActionTaken` REST endpoint (the model exists in §9.1, but §10 never contracts it) — "accept verdict" is acknowledged locally in both the extension and the Slack bot without a durable record.
- Slack message edits (`Edit First`) aren't persisted server-side, matching the extension's own client-local edit behavior.
- The Full Debate View (§6.5) is an explicit P1 roadmap item — Slack's "View More" shows expanded evidence, not the full 5-agent debate.
- `Integration.config` stores the Slack bot token and a generated API key in plaintext JSON — Bible §18 INF-4 ("Data encryption at rest") is an explicit, not-yet-built P1 item.
- Clerk's `user.deleted` webhook is logged, not acted on — hard-deleting would violate the Decision/Outcome/MessageDraft foreign keys against that user, and a real implementation needs a GDPR-safe anonymization strategy (Bible §16.1 Risk #7, itself an explicit not-yet-built item).
- The dashboard's Today Queue page has no filter/sort controls yet (Bible §18 DSH-2's "Filter and sort controls" is an explicit P1 item) and no Analytics/Company Memory/Settings pages (DSH-3/4/5, mostly P1/P2).
- Queue item cards link out to the prospect's real LinkedIn profile instead of wiring up the wireframe's View/Message/Snooze buttons — those need the same ActionTaken write path noted above, which doesn't exist yet.
- A transitive `postcss` vulnerability (GHSA-qx2v-qp2m-jg93) ships inside Next.js's own vendored dependency (`next/node_modules/postcss`) with no fix currently available upstream — not introduced by this codebase and not safely fixable without downgrading Next.js.
- Dashboard PostHog events (`queue_viewed`, `queue_item_clicked`) aren't wired yet — the extension's client-side events (`sidebar_opened`, `message_copied`, `message_edited`) are, as of this pass.
- No Datadog/Railway infra metrics (Bible §18 INF-2's "Datadog / Railway metrics", an explicit P1 item) — Sentry and PostHog cover errors and product events, not infrastructure metrics.
- Apollo's People Enrichment (person-level: verified title, seniority, email) isn't wired, only Organization Enrichment (company-level) — the two are separate Apollo endpoints, and only the latter maps directly to `Prospect`'s `company*` fields. Adding person-level enrichment on top of what the LinkedIn content script already scrapes is the natural next increment here.

## Testing

```
npm run test           # runs every workspace's Vitest suite
```

Tests mock Prisma/Redis/the Anthropic SDK at the module boundary, so the full suite runs without a live database, cache, or API key — useful in CI or on a machine without Postgres/Redis installed. There is currently no integration test suite against a real database; that's the natural next addition once local Postgres is available.

`apps/extension` got its first test suite in this pass (`lib/analytics.ts`, mocking posthog-js) — its React components (VerdictCard, MessageComposer, etc.) still have none, consistent with this being a Chrome extension where meaningful component tests would need a DOM-and-Chrome-API test harness that doesn't exist yet, rather than something skipped by oversight.

## Typecheck

```
npm run typecheck       # strict tsc --noEmit across every workspace
```

**Order matters on a fresh checkout**: `packages/database` and `packages/shared` publish their types from `dist/` (see their `package.json` "types" fields), which doesn't exist until they're built. Run `npm run build` before `npm run typecheck` — confirmed by deleting every `dist/` and reproducing the failure before fixing the CI step order below.

## Continuous Integration

`.github/workflows/ci.yml` runs on every push/PR to `main`/`master`: `npm ci` → `npm run build` (in that order, for the reason above) → `npm run typecheck` → `npm run test`. No secrets or external services required — the whole pipeline runs green with zero configuration, the same way it does on this machine with no live Postgres/Redis/Clerk/Slack credentials.

Bible §18 INF-3 also calls for a staging environment; that's the one piece still blocked on a real hosting account (a second Render environment/branch), unlike the deploy config itself (see below), which is fully written and just needs an account connected to it.

## Deployment (Bible §18 INF-1)

Bible §7.2/§7.3 specify Railway (API + DB) + Vercel (Dashboard). **This deviates from that at explicit user request: Render replaces Railway** for `apps/api`, `apps/slack-bot`, Postgres, and Redis. Vercel is unchanged for `apps/dashboard`, since it's a separate piece of the Bible's own architecture diagram and wasn't part of that request.

Every config schema detail below (top-level `databases:`/`services:` keys, `preDeployCommand` at the service level rather than nested under a `deploy` object, `fromService`'s `host`/`port`/`hostport` properties, `sync: false` for dashboard-entered secrets) was verified against Render's own current docs before writing `render.yaml` — none of it was assumed, since a wrong field name here would only surface as a failed deploy, not a local test failure.

### Render (`render.yaml`)

1. Connect this repo in the Render dashboard: **New +** → **Blueprint**. Render detects `render.yaml` automatically and provisions `argus-postgres`, `argus-redis`, `argus-api` (web service, health-checked at `/health`), and `argus-slack-bot` (background worker — no HTTP port, since it holds an outbound WebSocket to Slack rather than serving inbound requests).
2. You'll be prompted once, at Blueprint creation, for every var marked `sync: false` in `render.yaml` — the actual secrets (`ANTHROPIC_API_KEY`, `APOLLO_API_KEY`, `CLERK_WEBHOOK_SECRET`, etc.) that obviously can't live in a committed file.
3. `argus-api`'s `preDeployCommand` runs `prisma migrate deploy` (the non-interactive, production-safe Prisma command — `migrate dev` is a local-only tool) after build but before the new version takes traffic, Render's own documented pattern for exactly this.
4. `argus-slack-bot`'s `API_BASE_URL` can't be templated automatically (`fromService` only exposes bare host/port, not a scheme-prefixed URL) — set it manually once `argus-api` exists, to either its private-network address (`http://argus-api:<port>`) or its public `onrender.com` URL.
5. `CORS_ALLOWED_ORIGINS` in `render.yaml` has a placeholder dashboard URL — update it once the Vercel deployment's real URL is known.

### Vercel (`apps/dashboard/vercel.json`)

Vercel auto-detects the npm workspace root and installs from there — but `packages/shared` still needs to be *built* (not just installed) before `next build` can resolve its types, the same ordering issue found earlier for CI. `vercel.json`'s `buildCommand`/`installCommand` both `cd ../..` back to the monorepo root for exactly that reason. In the Vercel dashboard: **Add New** → **Project**, set **Root Directory** to `apps/dashboard`, and set the `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`/`API_BASE_URL` env vars (see `.env.example`) to the deployed `argus-api` URL.

### Known gap

Pinecone (`PINECONE_API_KEY`/`PINECONE_INDEX` in `.env.example`, Bible §9.3/§7.2's vector DB for semantic prospect search) was never actually implemented — found while auditing which env vars this deploy config needed to carry forward. It's excluded from `render.yaml` entirely rather than wiring in an unused variable; building the actual Pinecone integration is separate, not-yet-scheduled scope.
