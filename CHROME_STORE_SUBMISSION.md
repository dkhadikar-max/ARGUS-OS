# Chrome Web Store Submission — Readiness Checklist

Bible §19.2 Launch Day Runbook, T-7: "Submit Chrome Extension to Web Store (review takes 3-7 days)". This document tracks what's ready to submit today versus what only a human with a real Google account, payment method, and business/legal judgment can do — Claude cannot create accounts, pay fees, or make legal representations on the company's behalf.

## What's done in this codebase

- **Icons** (`apps/extension/public/icon-{16,32,48,128}.png`): previously nonexistent — `manifest.config.ts` had a comment saying they were "supplied later by design." Generated programmatically (an SVG eye mark — a literal nod to "Argus Panoptes," the many-eyed watcher — rasterized to the four sizes Chrome requires) rather than left blank, since a store submission needs them either way and this repo has no design tool/design team step to hand it to.
- **Fixed a submission-blocking bug**: `host_permissions` (and the background service worker's own fetch calls) were hardcoded to `http://localhost:4000`. A build submitted to the Store this way would be permanently non-functional for every real user — there's no dev server on their machine. Both now read the same `VITE_API_BASE_URL` env var (`apps/extension/.env.example`), defaulting to localhost for local dev (zero setup change) but overridable for a real production build pointed at the deployed `argus-api` URL.
- **Manifest V3 minimal-permissions posture** (Bible §16.1 Risk #12) was already correct before this pass: `permissions: ["storage"]` only, `host_permissions` scoped to `linkedin.com` and the API domain specifically — no `tabs`, no `<all_urls>`.
- **This document** and the listing copy below.

## Before you submit: build with the real production URL

```bash
cd apps/extension
VITE_API_BASE_URL=https://<your-deployed-argus-api-url> npm run build
```

Verify `dist/manifest.json`'s `host_permissions` shows your real API domain (not `localhost`) before zipping.

## What only you can do

1. **Google Developer account** — one-time $5 registration fee at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). Needs a real payment method and Google account.
2. **Host the privacy policy** (draft below) at a public URL — e.g. a page on the marketing site, or GitHub Pages. The Store requires a live URL, not a file in this repo.
3. **Have counsel review the privacy policy draft** before publishing it — it's an accurate technical description of what this codebase actually does with data (verified against the real implementation, not boilerplate), but a legal document making representations about compliance (GDPR/CCPA/etc.) for your specific target markets and company structure needs a lawyer's sign-off, not an AI's.
4. **Screenshots** (1280×800 or 640×400, at least one required) — need a real LinkedIn profile page with the sidebar actually open, which this environment can't produce (no unpacked-extension load against a live linkedin.com page — the same limitation noted throughout this repo's README for end-to-end extension testing). Take these from a real Chrome install with the extension loaded unpacked (`chrome://extensions` → Developer mode → Load unpacked → `apps/extension/dist`).
5. **Submit and monitor review** — Chrome's review process (3-7 days per the Bible's own runbook estimate) sometimes asks follow-up questions about permission usage; the justifications below are a starting point for answering those, not a guarantee of first-pass approval.

## Store listing copy (draft)

**Name:** ARGUS AI — Decision Operating System

**Summary** (≤132 chars): Verdict, evidence, and a personalized message on every LinkedIn profile — in under 10 seconds.

**Single purpose statement** (Chrome now requires exactly one, specific purpose per extension):
> ARGUS AI analyzes the LinkedIn profile you're viewing and shows a research-backed outreach recommendation (a verdict, supporting evidence, and a draft message) in a sidebar on that page.

**Permission justifications** (Chrome's listing form asks for one per requested permission):
- `storage` — stores your ARGUS sign-in session locally so you don't have to re-authenticate on every LinkedIn page.
- Host permission `https://www.linkedin.com/*` — the sidebar is injected directly into LinkedIn profile pages, and reads the visible profile content on the page you're already viewing to generate a recommendation.
- Host permission `https://<your-argus-api-domain>/*` — the extension calls ARGUS's own backend to run the analysis and generate a message; no other domain is contacted.

**Data disclosures** (Chrome's "Privacy practices" tab, distinct from the hosted privacy policy page):
- Does this extension collect user data? **Yes.**
- What's collected: the profile content of the LinkedIn page you're viewing (name, title, company, visible post text), and your own ARGUS account identifiers (used to authenticate and attribute your decisions).
- Purpose: providing the extension's single stated purpose (outreach recommendations) — not sold, not used for purposes unrelated to that.
- Third parties the data is sent to for that purpose: Anthropic (Claude API, to generate the verdict/message), Apollo.io and Clearbit (to enrich the prospect's company data), PostHog (product analytics on how the extension itself is used — see the privacy policy draft for exactly which events).

## Privacy policy (draft — host publicly before submitting)

> **ARGUS AI Privacy Policy**
>
> *Effective date: [fill in when published]*
>
> This policy describes what ARGUS AI (the "Extension") and its backend service (together, "ARGUS") do with data, for teams using the Chrome extension and web dashboard.
>
> **What we collect**
> - **Your account.** Name, email, and team membership, via Clerk (our authentication provider) when you sign up.
> - **The LinkedIn profiles you view.** When you open a LinkedIn profile with the Extension installed, we read the visible page content (name, title, company, and similar publicly-displayed profile fields) to generate a recommendation. We do not collect LinkedIn data from pages you don't actively view with the Extension active.
> - **Your preferences and decisions.** Message tone/length settings, which verdicts you acted on or overrode, and outcomes you log (e.g. "meeting booked") — this is how ARGUS improves its recommendations for your team over time.
> - **Product usage events** (e.g. when the sidebar opens, when you copy or edit a generated message) via PostHog, to understand how the product is used and improve it.
>
> **Who we share it with**
> - **Anthropic** (Claude API) — processes profile and company data to generate the verdict, evidence, and draft message. Subject to Anthropic's own data-handling terms for API customers.
> - **Apollo.io and Clearbit** — we query these services for additional, publicly-sourced company information (industry, size, funding) about the company in the profile you're viewing.
> - **PostHog** — receives product usage events as described above.
> - **We do not sell your data or the data of the people whose profiles you view.**
>
> **About the people whose profiles you view**
> ARGUS is a B2B sales tool: it processes professional, publicly-visible LinkedIn profile information about prospects on behalf of the sales team using it, similar in nature to other sales-intelligence and CRM enrichment tools. It does not create an account for, or directly notify, the person whose profile is viewed.
>
> **Data retention**
> Decision, evidence, and outcome records are retained for as long as your team's account is active, since they're the basis for ARGUS's own learning (Bible's "Decision Graph"). We don't yet have a self-serve data export or account-deletion flow — [see the engineering README's "Known gaps" for the current status of this].
>
> **Your choices**
> You can disconnect integrations (e.g. Slack) and adjust preferences from Settings. For account deletion or data-export requests, contact [fill in support contact].
>
> **Changes to this policy**
> [fill in — standard "we'll notify you of material changes" language, reviewed by counsel for your jurisdiction.]
>
> **Contact**
> [fill in — support email / company address.]

## Known gaps that affect this listing (already documented in README, repeated here for submission context)

- No self-serve data export or account deletion (Clerk's `user.deleted` webhook is logged, not acted on — needs a GDPR-safe anonymization strategy, an explicit not-yet-built item).
- `Integration.config` (Slack bot tokens) isn't encrypted at rest — doesn't affect the extension's own Store listing, but is relevant if your privacy policy makes data-security representations covering the whole product, not just the extension.
