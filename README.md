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

### Audit logging (Bible §9.1 `AuditLog` model, §19.1 "Audit logs capture all state changes", §18 INF-4)

`AuditLog` was fully modeled in the Prisma schema from Phase 1 but nothing ever wrote to it — found by cross-checking every entity/mutation the §18 backlog table actually specifies against what's implemented, not from anything the Bible calls out explicitly by name. `lib/audit.ts`'s `recordAudit()` now writes a row (`entityType`, `entityId`, `action`, `actorId`, `beforeState`/`afterState`, `ipAddress`/`userAgent`) at every state-changing mutation with real security/compliance weight: Decision creation and override, Outcome creation, and both Slack-connect paths plus both Slack-user-linking paths (manual `/argus link` and the OAuth auto-link). `requestMeta()` pulls `ipAddress`/`userAgent` from the Express request at the controller layer, since services only ever see parsed DTOs + `AuthContext`, never the raw request.

Deliberately never throws: a failed audit-row insert is logged loudly (not silently swallowed) but never rolls back or fails the operation it's describing — a Decision that already committed shouldn't error out because its own audit entry couldn't be written afterward.

Not audited (by scope, not oversight): read-only endpoints, and any surface (a future dashboard "Message"/"Snooze" button, for instance) that doesn't yet call the ActionTaken endpoint below in the first place.

### Real-time updates (Bible §10.6 WebSocket API, §18 BCK-6)

`apps/api` now runs a Socket.io server alongside the REST API on the same HTTP server/port (`lib/websocket.ts`), matching §10.6's `wss://.../ws?token={jwt}` contract: the JWT is verified with the exact same Clerk JWKS logic as REST's `Authorization: Bearer` scheme (`middleware/auth.ts`'s `authenticateWithJwt`, now exported for this reuse), and a client subscribes with `{"channel": "team:{teamId}"}` to receive `decision.created`/`outcome.logged` pushes. §18 names Socket.io specifically as the library, so "subscribe" and each push are Socket.io's own native event names rather than a raw `{type, ...}` envelope on a generic listener — the same contract, expressed idiomatically for the chosen library rather than reimplementing raw `ws` framing.

Two additions beyond §10.6's literal example, both necessary rather than decorative: (1) a client may only join the room for their own JWT's teamId — not spelled out in the spec, but a direct consequence of §19.1's security posture, since nothing should let one team's browser session eavesdrop on another's decision stream; (2) a `"connected"` ack carrying the resolved teamId, since the browser has no other way to learn its own ARGUS teamId before constructing the `"team:{teamId}"` channel name for step 1. The relay itself is the second consumer of the existing `channel:team:{teamId}` Redis pub/sub (apps/slack-bot's `team-alerts.ts` is the first) — `publishTeamEvent`'s payload was enriched with `prospectName`/`verdict`/`confidence`/`timestamp` (decision.created) and `timestamp` (outcome.logged) to match §10.6's documented push-event fields exactly, so the WebSocket layer relays verbatim with no extra fetch.

`apps/dashboard` connects from the browser (`lib/useTeamSocket.ts`, a client hook using the signed-in rep's own Clerk session token) and shows a lightweight live feed (`components/LiveQueueBanner.tsx`) above the Today Queue — proving the feature end-to-end without rebuilding DSH-2's own server-rendered data model into a fully reactive one (auto-inserting/re-ordering queue items live is further polish, not contracted by §10.6). Needs the new `NEXT_PUBLIC_API_BASE_URL` env var (the one dashboard env var actually shipped to the browser bundle, unlike server-side `API_BASE_URL`).

### Action Graph — recording what a rep did (Bible §5.1/§5.2, §9.1 `ActionTaken`)

`POST /api/v1/decisions/{id}/action` persists the Action Graph's `ActionTaken` row — one per decision (`@unique decisionId`, the same 1:1 shape as Override/Outcome), recording `actionType` (`MESSAGE_SENT`/`MESSAGE_COPIED`/`CRM_UPDATED`/`MEETING_BOOKED`/`PASSED`/`SNOOZED`/`RESEARCHED_MORE`) plus optional `details`. §10 (API Contracts) never actually contracts this endpoint — on inspection this looks like a gap in §10 itself rather than deliberately deferred scope: unlike Pinecone/cold-start's explicit "Week 3+" framing in §5.3, the Action Graph is one of §5.1's five core Day-1 graphs, and §9.1 already modeled `ActionTaken` with the same shape as Override/Outcome, both of which *do* have §10 endpoints. The request/response contract here was inferred from those two siblings.

Wired into the two places that already take a real, durable action on a decision: the Slack bot's "Accept" button (`MESSAGE_SENT`, since sending the drafted message to the rep's own DMs is the manual confirmation §11.1's `message_sent` event describes) and "Pass" button (`PASSED`, alongside the existing verdict override), plus the extension's message "Copy" button (`MESSAGE_COPIED`). All three calls are best-effort and never block the primary action they're describing — a second attempt correctly 409s (`DECISION_STALE`, the same code Override/Outcome duplicate-write attempts already use), which is expected and swallowed rather than surfaced as an error, since whatever the rep actually did already happened regardless of whether this secondary record succeeds.

Not wired: the dashboard's Today Queue wireframe (§6.2) shows View/Message/Snooze buttons per card, but no dashboard UI calls this endpoint yet — `QueueItemCard.tsx` still links out to the prospect's real LinkedIn profile instead (see Known gaps). The endpoint exists now; the dashboard buttons that would call it are separate, not-yet-built UI work.

### Company Memory (Bible §10.5, §18 DSH-4)

`GET /api/v1/memory` implements §10.5's contract — a real endpoint backing the dashboard's new `/company-memory` page (`components/PatternCard.tsx` + a risk-flags table), reachable via a small `NavBar` now shared across pages (the app had no navigation between pages until this pass, since Queue was the only real one). A brand-new team with no `CompanyMemory` row yet (§5.3's "empty on Day 1" cold-start problem) gets the same valid empty shape back, not a 404.

**What's real:** `patterns` maps the exact array `outcome.service.ts`'s `updateCompanyMemoryPattern` already computes (per-verdict meeting-rate correlations) into §10.5's response shape. `confidence` per pattern isn't a real statistical significance test (this codebase doesn't run one) — it's a disclosed heuristic instead of a fabricated number: `min(95, 50 + sampleSize * 5)`, rising with sample size and capped well short of certainty, documented as exactly that in `memory.service.ts`.

**What's honestly empty, not fabricated:** `riskFlags` (Bible's own example — "Director title + >1000 employees" — implies clustering the Risk Agent's free-text per-decision output, stored in `Decision.agentOutputs`, into named recurring conditions across decisions; that's real text-clustering work, not a data-mapping task like patterns was, and isn't built), `icpAccuracy` (needs versioned ICP history with retrospective accuracy tracking — `CompanyMemory.icpHistory` exists as a schema column but nothing ever writes to it), and `topPerformingMessages` (needs message-to-reply-rate correlation, not computed anywhere). All three return as empty array / `null` per the response schema rather than invented data, and the dashboard page shows an honest empty state for each rather than hiding the gap.

### Known gaps (flagged, not hidden)

- Slack message edits (`Edit First`) aren't persisted server-side, matching the extension's own client-local edit behavior.
- The Full Debate View (§6.5) is an explicit P1 roadmap item — Slack's "View More" shows expanded evidence, not the full 5-agent debate.
- `Integration.config` stores the Slack bot token and a generated API key in plaintext JSON — Bible §18 INF-4 ("Data encryption at rest") is an explicit, not-yet-built P1 item.
- Clerk's `user.deleted` webhook is logged, not acted on — hard-deleting would violate the Decision/Outcome/MessageDraft foreign keys against that user, and a real implementation needs a GDPR-safe anonymization strategy (Bible §16.1 Risk #7, itself an explicit not-yet-built item).
- The dashboard's Today Queue page has no filter/sort controls yet (Bible §18 DSH-2's "Filter and sort controls" is an explicit P1 item), and still has no Analytics or Settings pages (DSH-3/DSH-5 — Company Memory/DSH-4 is now built, see above).
- Company Memory's risk-flags clustering, ICP accuracy tracking, and top-performing-message correlation aren't built (see "Company Memory" section above for exactly why each is separate, larger scope than a data-mapping task).
- Queue item cards link out to the prospect's real LinkedIn profile instead of wiring up the wireframe's View/Message/Snooze buttons — the ActionTaken endpoint those would call now exists (see above), but the dashboard buttons/UI themselves don't yet.
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

**Staging environment (Bible §18 INF-3).** The top-level `previews:` block turns on Render's Preview Environments — a fresh, isolated copy of every service/database/env-group in this same `render.yaml`, spun up per-PR rather than hand-maintained as a second Blueprint that could drift from production's. `generation: manual` requires `[render preview]` in a PR's title to actually provision one (deliberately not `automatic`: this feature needs a paid Render plan and provisions real duplicate `argus-postgres`/`argus-redis`/`argus-api`/`argus-slack-bot` instances, so it's opt-in per PR rather than billed on every trivial one); `expireAfterDays: 7` bounds the cost of one left open by mistake. Preview databases start empty — Render doesn't copy production data in — which is fine for testing app behavior but means seed data would need an `initialDeployHook` if that's ever needed.

### Vercel (`apps/dashboard/vercel.json`)

Vercel auto-detects the npm workspace root and installs from there — but `packages/shared` still needs to be *built* (not just installed) before `next build` can resolve its types, the same ordering issue found earlier for CI. `vercel.json`'s `buildCommand`/`installCommand` both `cd ../..` back to the monorepo root for exactly that reason. In the Vercel dashboard: **Add New** → **Project**, set **Root Directory** to `apps/dashboard`, and set the `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`/`API_BASE_URL` env vars (see `.env.example`) to the deployed `argus-api` URL.

### Known gap

Pinecone (`PINECONE_API_KEY`/`PINECONE_INDEX` in `.env.example`, Bible §9.3's vector DB schema) was never implemented — it's excluded from `render.yaml` entirely rather than wiring in an unused variable. On closer reading, this is correctly scoped as not-yet-built rather than a missed MVP requirement: §9.3's schema and Appendix F's `cosineSimilarity`-based cold-start scoring back §5.3's "Learning Layer (Week 3+)" — an explicit *later* growth-phase capability ("patterns emerge at 50+ decisions per user," "accuracy 80%+ by month 3") — and §18's own Epic 1-6 task breakdown (the backlog this build has followed phase-by-phase) never lists a Pinecone/vector-search/cold-start task among its P0/P1/P2 line items. Building it is real, scoped, future work — just not a gap in what's shipped so far.
