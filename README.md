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

`apps/dashboard` now wires client-side PostHog the same way: `lib/analytics.ts` is close to a line-for-line port of the extension's own (same `posthog-js/dist/module.slim.no-external` import, same disabled-autocapture/pageview/session-recording config, same exact-version pin) — Next.js doesn't have MV3's hard CSP constraint, but the underlying reasoning still holds: §11.1's event catalog is closed, so there's no need for the session-replay/surveys/feature-flag code the default "full" build pulls in regardless. `components/PostHogIdentify.tsx` bridges Clerk's session (server-side) to PostHog (browser-only) via Clerk's client-side `useUser()` hook, mounted once in the root layout. `queue_viewed` fires once per mount from `QueueList.tsx`, not on every filter/sort change (those aren't a distinct event in the Bible's catalog); `filter_applied` is honestly always `false`, since the page has no URL-persisted filter state yet — every fresh view genuinely starts unfiltered. `queue_item_clicked` fires from `QueueItemCard.tsx`'s existing "View on LinkedIn" link. `time_spent_ms` (optional in the schema) isn't tracked — that needs page-visibility/beacon handling on unmount, more lifecycle complexity than this pass's scope.

Neither the dashboard's nor the extension's client-side events have live end-to-end verification against a real signed-in session / LinkedIn page (this environment can't authenticate against real Clerk credentials or load an unpacked extension against a live page) — verified instead via typecheck, real production builds, and (for the extension) unit tests mocking posthog-js plus direct inspection of the built bundle. The dashboard now has its own test suite too — see "Dashboard test infrastructure" below.

### Dashboard test infrastructure (first-ever test suite)

`apps/dashboard` had no `vitest.config.ts` at all until this pass — every dashboard feature so far was verified via typecheck and real production builds only, not automated tests. Added `vitest.config.ts` (`environment: "node"`, matching `packages/shared`'s own config, since the dashboard's server-side logic doesn't need a DOM) and a `test` script, so `npm run test` from the repo root (and CI, which just runs that same script) now picks up dashboard tests automatically.

The first real test file is `lib/api-client.ts`'s `apiFetch` — deliberately chosen because this exact function had a real bug (`response.json()` running before the `response.ok` check) caught and fixed during the earlier full-codebase audit, with no regression test to catch it coming back. 6 tests cover the missing-token path, a successful request, a JSON error body with and without the expected `error.message` shape, and both non-JSON-body cases (a proxy's HTML error page on a real 5xx, and an otherwise-`ok` response with a malformed body).

No React component tests yet — same reasoning `apps/extension`'s own gap already documents: meaningful component tests need `@testing-library/react` (or similar), a new testing paradigm this monorepo doesn't use anywhere yet, and introducing it is a separate, larger piece of work than adding the config + first logic-level test this pass did. `components/QueueList.tsx`'s sort/filter logic and `components/QueueItemCard.tsx`'s View/Message/Snooze handlers remain untested beyond typecheck + manual verification.

**Datadog infra metrics** (Bible §18 INF-2 "Datadog / Railway metrics", P1; §17.3's "API uptime 99.9% — Datadog" success metric) fill the one leg Sentry (errors) and PostHog (product events) don't cover: request-level latency, throughput, and error rate. `lib/datadog.ts` wraps `hot-shots` (a StatsD client; verified against the installed package's own `node_modules/hot-shots/types.d.ts`, not assumed) submitting over UDP to a Datadog Agent, env-gated on `DATADOG_AGENT_HOST` and no-op-safe without it, the same pattern as `SENTRY_DSN`/`POSTHOG_API_KEY`. `middleware/metrics.ts` records `http.request.duration`/`http.request.count`/`http.request.errors` (5xx only) for every request, mounted before even the webhook router so nothing is missed, tagged by `method`/`route`/`status` — the *route pattern* (e.g. `/:id/action`), not the raw path with real decision IDs substituted in, since per-ID tags would be exactly the unbounded-cardinality problem Datadog's own docs warn against. `errorHandler` on the StatsD client (also verified against the real types, not assumed) logs and swallows socket errors rather than letting an unreachable agent throw mid-request. Not wired: a graceful-shutdown hook to flush/close the client — `lib/analytics.ts`'s own `shutdownAnalytics()` has the identical gap, since no `SIGTERM` handler exists in `server.ts` at all yet.

### Audit logging (Bible §9.1 `AuditLog` model, §19.1 "Audit logs capture all state changes", §18 INF-4)

`AuditLog` was fully modeled in the Prisma schema from Phase 1 but nothing ever wrote to it — found by cross-checking every entity/mutation the §18 backlog table actually specifies against what's implemented, not from anything the Bible calls out explicitly by name. `lib/audit.ts`'s `recordAudit()` now writes a row (`entityType`, `entityId`, `action`, `actorId`, `beforeState`/`afterState`, `ipAddress`/`userAgent`) at every state-changing mutation with real security/compliance weight: Decision creation and override, Outcome creation, ActionTaken recording, and both Slack-connect paths plus both Slack-user-linking paths (manual `/argus link` and the OAuth auto-link). `requestMeta()` pulls `ipAddress`/`userAgent` from the Express request at the controller layer, since services only ever see parsed DTOs + `AuthContext`, never the raw request.

Deliberately never throws: a failed audit-row insert is logged loudly (not silently swallowed) but never rolls back or fails the operation it's describing — a Decision that already committed shouldn't error out because its own audit entry couldn't be written afterward.

Not audited (by scope, not oversight): read-only endpoints only. The dashboard's Message/Snooze buttons (see "Today Queue action buttons" above) call the same ActionTaken endpoint the Slack bot already did, so they were already covered by the `action_recorded` audit entry above — nothing new was needed there.

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

**Also real now:** `topPerformingMessages`. Bible §10.5's own worked example — `{"pattern": "Mentions specific metric from prospect's post", "replyRate": 0.34, "sampleSize": 47}` — treats each personalization hook itself as the "pattern": the Judge agent already generates these as natural-language phrases (§8.7's `personalization_hooks`, e.g. "K8s scaling post"), so `memory.service.ts`'s `computeTopPerformingMessages` groups every `MessageDraft` across the team by its exact hook string and correlates against whether the linked decision's outcome represents a genuine two-way reply (`REPLIED_NO_MEETING`/`MEETING_BOOKED`/`OPPORTUNITY_CREATED`/`CLOSED_WON` — deliberately narrower than "has any logged outcome," since `CLOSED_LOST`/`DISQUALIFIED`/`SNOOZED` can be logged from a CRM sync with no reply ever having happened). This is real data-mapping over signals the system already collects, not new NLP/clustering work. A minimum sample size of 3 keeps a single lucky (or unlucky) message from looking like a definitive pattern, and results are capped at the top 10 by reply rate.

**`riskFlags`, with an important caveat.** Bible §10.5's own worked example — `{"condition": "Director title + >1000 employees", "severity": "moderate", "recommendation": "...", "occurrenceRate": 0.23, "falsePositiveRate": 0.15}` — implies clustering the Risk Agent's free-text per-decision output into named recurring conditions across decisions. That's genuinely real text-clustering/NLP work this codebase has no infrastructure for (no embeddings, no Pinecone — see the Pinecone "Known gap" further down), and there's no threshold anywhere in the Bible for what counts as, say, ">1000 employees" — building the Bible's *exact* illustrative example would mean inventing a bucketing scheme with no specified boundaries. `memory.service.ts`'s `computeRiskFlags` instead reuses a taxonomy the system *already* defines: the Risk Agent's own prompt (`agents/prompts.ts`) tells Claude to classify each risk under one of 6 recurring themes ("Common risk categories: Authority, Budget, Timing, Competition, Fit, Engagement"). Each decision's freeform `risk.risks[].category` text is keyword-matched against those same 6 themes (falling back to the raw category text when nothing matches), then grouped across every decision the team has generated — `occurrenceRate` is the fraction of assessed decisions where that theme appeared (counted once per decision, not once per risk item), `falsePositiveRate` is the fraction of theme-flagged decisions with a logged outcome that still got a reply anyway (the flag would have been a false alarm), and `severity` takes the highest severity seen across occurrences. A minimum of 3 occurrences keeps a single decision from looking like a "recurring" condition. This is honest, disclosed keyword-normalization over real system output — not the free-form NLP clustering the Bible's own example implies, and it deliberately won't reproduce that exact example's wording.

**What's honestly still empty, not fabricated:** `icpAccuracy` needs versioned ICP history with retrospective accuracy tracking — `CompanyMemory.icpHistory` exists as a schema column but nothing ever writes to it; `ICPDefinition` itself is a single row per team, upserted in place with no history preserved, so building this would also mean starting to snapshot every ICP change going forward, not just computing over data that already exists. Returns `null` per the response schema rather than invented data, and the dashboard page shows an honest empty state rather than hiding the gap.

### Analytics (Bible §18 DSH-3)

Unlike ActionTaken/Company Memory/Settings, this didn't need a new backend endpoint — `GET /api/v1/outcomes` (§10.3, already built) already returns exactly what DSH-3's three backlog items need: `data` backs the decision history table, `aggregations.byVerdict` backs the Tremor `BarChart` (meeting rate per verdict). One real addition: `accuracy` (`totalDecisions`, `mode`, `score`), extending that same response beyond §10.3's literal documented example — verified against the Bible's own worked example before adding it, the same way every other additive field this pass has introduced was.

`mode` reuses Appendix F's own "learning" (<50 team decisions) / "calibrating" (50-200) / "mature" (>200) tiers verbatim, even though the confidence-multiplier mechanism Appendix F originally describes them for isn't itself implemented — `totalDecisions` is a genuinely new query (`countDecisionsForTeam`), since it needs *all* decisions a team has ever generated, not just outcome-logged ones (a team can generate many verdicts while logging few ground-truth outcomes, so `pagination.total` on this same endpoint would have undercounted it). `score` is the weighted meeting-rate across STRONG_YES/YES outcomes specifically (weighted by each verdict bucket's own sample size, not a naive average of the two rates) — a "the AI said yes, did it convert" proxy, `null` when neither bucket has a logged outcome yet rather than a fabricated zero.

One small routing fix this needed: §10.3 documents `teamId` as always required in the query string, but a JWT-authenticated caller (the dashboard) has no other way to learn its own teamId before making the call — every other endpoint just derives it from `req.auth.teamId` directly. `outcome.routes.ts` now defaults the query's `teamId` to the caller's own JWT-resolved team only when the caller omitted it; an explicitly-passed `teamId` (e.g. from the Slack bot's team-scoped API key) is still honored and still checked against `req.auth.teamId`, so this doesn't loosen anything the original contract enforced.

**Per-rep accuracy breakdown.** The Manager Morgan persona (§4.4) specifically wants "decision accuracy score per rep" and "filter by rep, see decision history" for 1:1 coaching, not just one team-wide number. `accuracy.byRep` is a new array on the same `GET /api/v1/outcomes` response — one entry per team member who's generated at least one decision, each with the exact same weighted STRONG_YES/YES meeting-rate proxy the team-wide `accuracy.score` uses, just scoped to that rep's own decisions instead of collapsed across the team. It's a new query (`getDecisionsForRepBreakdown`) against `Decision` (not `Outcome`) for the same reason `totalDecisions` above is: a rep's `totalDecisions` needs to count every verdict they've generated, not just the ones with a logged outcome. A rep with no name set (`User.name` is nullable) falls back to their email rather than showing a blank row. Rendered as a new table on the dashboard's `/analytics` page.

**Filter by rep.** The persona's other ask — "filter by rep, see decision history" — is now wired too: `components/RepFilterSelect.tsx` (a small Client Component; the page itself stays a Server Component) reads/writes a plain `?rep=userId` URL search param, populated from the same `accuracy.byRep` list the table above already computes, so no new data fetch was needed just for the dropdown's options. `api.getOutcomes` forwards `rep` as `userId` to the already-existing `?userId=` query param `listOutcomesQuerySchema`/`listOutcomes` support (no backend change required — this only needed a client to actually pass it). Worth being explicit about the scope: this filters *only* the decision-history table's `data` array. `aggregations.byVerdict`, `accuracy.score`, and `accuracy.byRep` all stay team-wide regardless of the filter, since `outcome.service.ts`'s aggregation queries (`getVerdictAggregations`, `countDecisionsForTeam`, `getDecisionsForRepBreakdown`) never read `query.userId` — matching exactly what the persona's journey map actually pairs the filter with (reviewing one rep's decision history for a 1:1), not a full-page recompute.

### Settings (Bible §18 DSH-5)

Two P1 backlog items, both with the same underlying gap as ActionTaken and Company Memory before them: `UserPreferences` and `ICPDefinition` are fully modeled in §9.1, but §10 (API Contracts) never contracts REST endpoints for either. `GET`/`PUT /api/v1/preferences` and `GET`/`PUT /api/v1/icp` fill that gap, backing the dashboard's new `/settings` page.

**Preferences** (`modules/preferences`): a user who's never opened Settings still has real, effective preferences — Prisma's own `@default(...)` values — so `GET` returns those (with `updatedAt: null`, an honest "never explicitly saved" signal) rather than a 404. The form itself is a plain `<form action={...}>` Server Action with no client-side state; this app is pinned to React 18 (no `useActionState`), so unlike the ICP editor below, it can't surface inline save-success/error feedback — it either succeeds (the page revalidates with the new values) or throws, surfaced by Next's own error boundary.

**Team ICP** (`modules/icp`): only `ADMIN`/`FOUNDER`/`MANAGER` roles may edit it (the same `ADMIN_ROLES` set Slack-connect uses — now exported once from `middleware/auth.ts` instead of duplicated). Saving increments `ICPDefinition.version`, because `decision.service.ts`'s AI-5 cache key already treats `icpVersion` as the signal that a cached debate output is stale — getting this wrong would silently serve stale verdicts against an updated ICP. Criteria weights must sum to ~1 (schema comment already noted this is enforced at the service layer, not in Zod, since a manager mid-edit has a valid-to-hold-but-not-to-save transient state); an empty criteria array is exempt, to allow clearing the ICP entirely. The editor itself (`components/IcpCriteriaEditor.tsx`) is a Client Component — a dynamic add/remove list needs real client state, unlike the preferences form — calling the Server Action directly rather than via `<form action>`.

Out of scope (P2, explicitly not attempted): "Integration connections" (Slack connect already has its own UI on the Queue page) and "Billing page (Stripe)" (real payment processing, needing live Stripe credentials and business decisions this pass has no basis to make).

### Today Queue filter and sort controls (Bible §18 DSH-2)

The last unbuilt piece of DSH-2 — `components/QueueList.tsx` filters (by verdict, toggle chips) and sorts (priority/confidence/most-recent) entirely client-side against the already-fetched queue, since a rep's daily queue is a small, bounded list that doesn't need a new API round-trip or server-side query params for this. `GET /api/v1/queue`'s response gained one additive field beyond §10.4's literal documented example: `createdAt` (the decision's raw timestamp) — `lastActivity` is a formatted display label ("New since yesterday", "3 days ago"), not something a "most recent" sort could actually sort by.

### Today Queue action buttons (Bible §6.2, ActionTaken)

`QueueItemCard.tsx` originally substituted a single "View on LinkedIn" link for the wireframe's `[View] [Message] [Snooze]` trio, because the ActionTaken endpoint those buttons need didn't exist yet at the time. It does now (see "ActionTaken REST endpoint" below) — this wires the real three:

- **View** lazy-fetches the full decision (`GET /api/v1/decisions/{id}`) on first click and expands the card to show the Judge's reasoning and the actual message body — `messagePreview` on the queue list response is a 120-char summary, not something to build a real message view from. Fires `queue_item_clicked` (Bible §11.1) on first expand, the same event the old LinkedIn link used to fire.
- **Message** lazy-fetches the same full decision if needed, copies the message body to the clipboard, and records `MESSAGE_COPIED`.
- **Snooze** records `SNOOZED` directly, no fetch needed.

Both actions call a `recordQueueActionAction` Server Action (`app/queue/actions.ts`) that revalidates `/queue` afterward — `queue.repository.ts` already excludes any decision with an existing `ActionTaken` row, so recording either action is what actually removes the card from Today's Queue (matching the wireframe's own "PASSED / WAITING / MESSAGED / WON" footer buckets), not separate client-side list-splicing. A `DECISION_STALE` response (the decision was already acted on elsewhere — Slack, the extension) still revalidates, since that also means the card should already be gone.

The dashboard's `api-client.ts` (server-only, uses Clerk's server-side `auth()`) can't be called directly from a client component's `onClick` — the existing `IcpCriteriaEditor.tsx` → `updateIcpAction` pattern is reused here rather than inventing a new one: two client-callable Server Actions (`getFullDecisionAction`, `recordQueueActionAction`) wrap the server-only client.

### Full Debate View (Bible §6.5, §10.2 `includeDebate`)

`options.includeDebate` has existed in `createDecisionRequestSchema` since §10.2 was first built, but nothing ever read it and `decisionResponseSchema` had no field for its output to land in — the option was entirely dead. `DecisionResponse` now has an optional `debate` field (the same `agentDebateOutputSchema` — research/icp/intent/risk/judge — the orchestrator already produces and `Decision.agentOutputs` already persists, see `packages/shared/src/schemas/agents.ts`), populated two ways: `POST /api/v1/decisions` includes it only when `options.includeDebate` is `true` (`false` by default, matching every one of §10.2's own worked examples, so the common-case sidebar response stays as lean as it always was); `GET /api/v1/decisions/{id}` always includes it, since that's specifically the endpoint "View More" / deep inspection calls. A malformed or pre-existing `agentOutputs` row degrades to `debate: null` (`decision.service.ts`'s `parseDebate`) rather than a 500.

Two surfaces now render it:
- **Slack** — `decision_view_more`'s "View More" button (`apps/slack-bot/src/blocks/full-debate.ts`) now renders all 5 agents' actual reasoning instead of the flattened evidence list it showed before, including the Judge's weighted-aggregation formula (ICP 40% + Intent 35% + Risk 15% + Research 10%, from the Judge agent's own prompt in `agents/prompts.ts`) and final score.
- **Extension sidebar** — a new "View full debate →" link (`sidebar/App.tsx`) fetches the GET endpoint on demand and renders `FullDebateView.tsx`, a "Back to Sidebar"-toggled view with one card per agent, matching the §6.5 wireframe's sections. Fires `full_debate_viewed` (Bible §11.1) on leaving the view (not entering), so `time_spent_ms` — a required, not optional, schema field here — is a real measured duration rather than a fabricated 0; `agent_viewed: "all"` is honest, not a placeholder, since this pass renders every agent at once rather than a tabbed one-at-a-time view.

Not built: the wireframe's own `[Override]`/`[Share with Team]` buttons aren't duplicated inside this view — Override is one click away via "Back to Sidebar", where the existing override controls already live, and "Share with Team" has no backing endpoint anywhere in §10 (same category of gap as Company Memory/ActionTaken before it needed one added).

### Chrome Web Store submission prep (Bible §19.2 T-7 launch runbook item)

See **[CHROME_STORE_SUBMISSION.md](./CHROME_STORE_SUBMISSION.md)** for the full checklist, store listing copy, and a privacy policy draft. Two concrete things fixed in the codebase itself, not just documentation:

- **Icons** (`apps/extension/public/icon-{16,32,48,128}.png`) didn't exist at all — `manifest.config.ts` had an explicit comment saying they were "supplied later by design." Generated programmatically (an SVG eye mark, rasterized to the required sizes) since a Store submission needs them regardless and this repo has no separate design-asset pipeline to hand it to.
- **A real submission blocker**: `host_permissions` and the background service worker's fetch calls were hardcoded to `http://localhost:4000` — a "supposed to vary by build channel" comment existed, but nothing actually implemented that. A build submitted to the Store this way would ship permanently non-functional (every user's install would try to reach a dev machine's localhost). Both now read one `VITE_API_BASE_URL` env var (`apps/extension/.env.example`, new), keeping the manifest's declared permission and the code's actual fetch target in sync — verified by building once with the default and once with an override and diffing `dist/manifest.json` plus the bundled JS.

What's left is genuinely not something this pass can do: creating the Google Developer account, paying its $5 fee, hosting the privacy policy at a public URL, and taking real screenshots of the sidebar against a live LinkedIn page (same "can't load an unpacked extension against a live page" limitation noted elsewhere in this README) all need a human with real credentials and judgment, not more code.

### Data encryption at rest (Bible §18 INF-4)

`Integration.config` stores a real Slack bot OAuth token and a generated API key — previously as plaintext JSON. `lib/encryption.ts` now encrypts both with AES-256-GCM (authenticated encryption, so a tampered ciphertext fails loudly via GCM's own auth-tag check rather than decrypting to silent garbage) before `integration.repository.ts` ever writes them, and decrypts them back in `integration.service.ts`'s `toResolution()` — the one place the raw config is reshaped into what the rest of the app consumes.

`slackTeamId`/`botUserId`/`alertChannelId` stay plaintext: they aren't credentials, and `slackTeamId` specifically has to stay queryable (`findSlackIntegrationBySlackTeamId` does a Prisma JSON-path match on it, which an encrypted blob can't support) — only the two actual secrets are encrypted, not the whole config object.

`CONFIG_ENCRYPTION_KEY` is optional at the schema level (a checkout that never touches Slack integrations still boots), but `encrypt()`/`decrypt()` throw a clear, specific error the moment they're actually invoked without it configured — never a silent plaintext fallback. This is the same pattern `authenticateWithJwt` already uses for missing Clerk config, applied to a second feature.

One deliberate non-goal: no backward-compatibility shim for pre-existing plaintext rows. This hasn't shipped to real users yet, so there's no production data to migrate — any local dev row connected before this change would need Slack reconnected (re-running the connect flow) rather than silently continuing to read as plaintext.

### Full-codebase audit fixes

Six parallel agents audited the whole build (every workspace, plus a dedicated pass cross-checking every §8 prompt/§9.1 schema/§10 contract/§11.1 event against the Bible line-by-line — that pass found zero undocumented deviations). Every candidate finding was independently re-verified against the actual current code before being trusted; several agent claims didn't hold up (a claimed content-script MutationObserver leak turned out to be a single one-time call, not a per-navigation leak, and a claimed cross-team `linkSlackUser` gap turned out to be harmless since `User.email` is globally unique and the caller already validates team membership first). Eight real, verified issues were fixed:

- **CORS prefix-match bypass** (`app.ts`, `lib/websocket.ts`) — `origin.startsWith(entry)` let `https://your-dashboard.vercel.app.evil.com` pass as if it were the real dashboard, since it literally starts with the allowed string. `lib/cors.ts`'s `isOriginAllowed()` now exact-matches every entry except `chrome-extension://` ones (which still need a prefix match, since the extension ID varies per build) — one shared function instead of the same bug duplicated in both the REST and Socket.IO CORS configs.
- **Cross-tenant outcome data leak via API key** (`outcome.controller.ts`) — the `teamId`-matches-auth check only applied to JWT/"user" auth; an API-key holder could pass any `teamId` in the query string and read another team's outcomes. Now applies regardless of auth type.
- **ICP version lost-update race** (`icp.repository.ts`) — a find-then-branch-then-write pattern let two concurrent Settings saves both read the same version and silently clobber each other's edit. Replaced with a single atomic `upsert` using Postgres's own `version: { increment: 1 }`, immune to the race regardless of what else read the row a moment earlier.
- **Company Memory pattern update race** (`outcome.service.ts`/`outcome.repository.ts`) — the same class of race, narrower window (two outcomes logged for *different* verdicts at once could each read the same stale patterns array and one write would drop the other's). Fixed with `prisma.$transaction` plus an explicit `SELECT ... FOR UPDATE` row lock around the whole read-modify-write.
- **Dashboard swallowing a real error class** (`api-client.ts`) — `response.json()` ran before the `response.ok` check, so a non-JSON error body (a proxy's HTML 502 page, a realistic infra scenario) threw a raw `SyntaxError` instead of the intended `ApiError`. Now parsed inside its own try/catch either way.
- **Slack bot handlers with no error feedback** (`actions.ts`, `commands.ts`) — several handlers called the backend with no `.catch()`, leaving a rep thinking their click worked when the underlying API call had actually failed. A shared `withErrorFeedback()` helper (`lib/error-feedback.ts`) now wraps each one and posts an ephemeral "something went wrong" message on failure — also fixed `decision_edit` silently passing a no-op callback instead of the real `respond` when the rep isn't linked yet, unlike every other handler.
- **ICP editor Save button not disabled on invalid weights** (`IcpCriteriaEditor.tsx`) — the red warning rendered but Save stayed clickable, round-tripping to a guaranteed `VALIDATION_ERROR`. `icpWeightsAreValid()` moved to `packages/shared` so the client-side disabled check and the server-side throw use the exact same tolerance, not two copies that could drift.

### Known gaps (flagged, not hidden)

- Slack message edits (`Edit First`) aren't persisted server-side, matching the extension's own client-local edit behavior.
- The Full Debate View (§6.5) is now built — see "Full Debate View" above — except its wireframe's `Share with Team` button, which has no backing endpoint (also noted there).
- Clerk's `user.deleted` webhook is logged, not acted on — hard-deleting would violate the Decision/Outcome/MessageDraft foreign keys against that user, and a real implementation needs a GDPR-safe anonymization strategy (Bible §16.1 Risk #7, itself an explicit not-yet-built item).
- All of Bible §18 DSH-2/3/4/5's dashboard backlog items are now built (see "Today Queue filter and sort controls" above for the last of them).
- Analytics now has both a per-rep accuracy breakdown and a rep filter on the decision-history table (§4.4 Manager Morgan persona, see "Analytics" section above) — the filter deliberately scopes only that table, not the page's other aggregations; see that section for exactly why.
- The ICP editor's criteria `value` field is a single text input — `icpCriterionSchema` also allows a `string[]` (e.g. an "in" operator listing multiple industries), which this simplified editor can't produce distinctly from a plain string. A real multi-value input is future polish, not a data-model gap.
- Company Memory's top-performing-message correlation and risk-flags are both now built (see "Company Memory" above — the latter via a disclosed keyword-normalization heuristic, not real NLP clustering). ICP accuracy tracking still isn't — it's genuinely larger scope, needing a new write-path to start snapshotting ICP history, not a data-mapping task like the other two.
- Queue item cards now have real View/Message/Snooze buttons (see "Today Queue action buttons" above) instead of a single LinkedIn link.
- A transitive `postcss` vulnerability (GHSA-qx2v-qp2m-jg93) ships inside Next.js's own vendored dependency (`next/node_modules/postcss`) with no fix currently available upstream — not introduced by this codebase and not safely fixable without downgrading Next.js.
- The dashboard now has test infrastructure and one real test file (see "Dashboard test infrastructure" above) — but no React component tests yet, so `components/QueueList.tsx`/`QueueItemCard.tsx`/etc. are still verified via typecheck and real production builds only, not unit tests.
- Datadog infra metrics are now wired (see "Datadog infra metrics" above) — "Railway metrics" specifically doesn't apply, since this project deploys to Render, not Railway (an explicit user-requested deviation noted under Deployment below).
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
