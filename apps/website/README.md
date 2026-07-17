# ARGUSos Website

Decision Operating System for B2B Revenue Teams — Marketing Site v3.0

## Single Source of Truth

This site is built directly from the ARGUS AI v3.0 Product Bible. Every design decision, color token, component name, and content block maps to a specific section of the Bible.

| Bible Section | Site Implementation |
|:---|:---|
| §1.2 — Point-of-action delivery | Hero sidebar mockup showing Chrome Extension UI |
| §5.1 — Five Graphs architecture | FiveGraphsSection with custom glyphs |
| §8.7 — Judge Agent verdict spectrum | VerdictSpectrumSection with exact confidence ranges |
| §6.3 — Company Memory UX flow | CompanyMemorySection with patterns + risk flags |
| Closing epigraph (p.73) | Footer: "Every decision is a node. Every node is a lesson." |
| §3.4 — Feature-to-JTBD mapping | Hero copy: "analyze evidence, explain reasoning, learn from outcomes" |
| Policy v2.1 "Homepage Hierarchy" | Hero: Pain stat → Promise → Proof (sidebar mockup) → Product (H1) → Path (buttons) |
| §13.2 — Pricing Tiers | CTASection: Free ($0) / Starter ($49/mo) / Pro ($149/mo) / Enterprise ($499/mo) |

## Bible-compliance audit (integration into the monorepo)

Audited section-by-section against the actual 73-page ARGUS AI v3.0 Product Bible before integration. Findings:

- **Verified accurate**: Five Graphs names/descriptions (§5.1), Verdict Spectrum's five confidence ranges (§8.7 — 90-100/70-89/50-69/30-49/0-29), Company Memory's pattern/risk-flag examples (§6.3, lifted near-verbatim from the Bible's own mockup), the hero's weighted-scoring formula and "&lt;10s verdict" claim, and the footer's closing epigraph (verbatim match to the Bible's final page).
- **Fixed — broken anchor**: `Navigation.tsx`'s "Outcomes" link pointed to `#outcomes`, but no section had that id. `FiveGraphsSection.tsx`'s Outcome Graph card now carries `id="outcomes"`.
- **Fixed — product name**: page `<title>`/OG metadata said "ARGUS" (dropping "AI"); the Bible's canonical product name is "ARGUS AI" (cover page), which the footer already used correctly.
- **Fixed — CTA had no basis in the Bible (at the time)**: the previous CTA sold a "$7,500 Revenue Sprint" audit, attributed in this file to "§12.3 Meta-Play cold outreach." Reading §12.3 directly: the real Meta-Play experiment is Argus prospecting sales leaders and offering them a *14-day free trial*, not a paid audit — there was no "$7,500" figure anywhere in the Bible. Replaced same-day with the Bible's actual subscription plan structure (§13.2: Free / Starter / Pro / Enterprise), dollar amounts withheld per explicit instruction — see "Policy v2.1 alignment" below for what superseded this within hours.

## Policy v2.1 alignment (ARGUS Unanimous Policy v2.1, frozen 2026-07-12)

A separate, newer governing document — unanimously adopted by Kimi/GPT/GPT-2, explicitly frozen ("no further strategic revisions without customer evidence") — arrived after the Bible-compliance pass above and after the $7,500 CTA had already been removed as unsubstantiated. Read in full and compared section-by-section against both the Bible and this site's current state:

- **The $7,500 figure turned out to be real policy, just renamed.** The Policy's "What We Killed" list retires the *name* "Revenue Sprint" in favor of "Intelligence Sprint" — same $7,500 price point, now one of three explicitly-priced GTM entry paths (Free Decision Assessment $0 / Intelligence Sprint $7,500 / Enterprise Engagement $25,000+), not a fabrication.
- **2026-07-17 update — reverted to Bible §13.2 SaaS tiers, by explicit instruction.** `CTASection.tsx` briefly showed the Policy's three GTM entry paths marked "Do Not Change." Per explicit instruction, that GTM pricing motion is deferred until the Phase 3 enterprise engagement is actually built, and the homepage's CTA slot now shows the Bible's real four subscription tiers instead (Free $0 / Starter $49 per mo / Pro $149 per mo / Enterprise $499 per mo, each with its §13.2 seat count, decision limit, and feature set). `HeroSection.tsx`'s Path buttons and `Navigation.tsx`'s nav CTA were updated to match ("Start Free" / "View Plans" instead of "Free Assessment" / "Intelligence Sprint"). The Policy's three-path GTM naming and its $7,500 / $25,000+ price points remain the intended Phase 3 motion — see "Known gaps" below.
- **Added — the frozen "Homepage Hierarchy"** (Pain → Promise → Proof → Product → Path, explicitly "Do Not Change"): `HeroSection.tsx` leads with the Pain stat ("40% of pipeline time is wasted on poor-fit prospects"), states the Promise verbatim ("Know why before you act — every time"), keeps the existing sidebar mockup as Proof and the existing H1 as Product framing (neither contradicted the Policy, so neither was rewritten). The structure is unchanged by the 2026-07-17 pricing revert — only the Path buttons' labels changed to match the SaaS tiers now shown.
- **Added — the frozen "One-Liner"**: "Stop guessing. Start deciding with evidence." was absent from the site entirely; now sits directly under the Promise line in the Hero, and replaces "AI Revenue Intelligence" in the page's meta description (that phrase read too close to the "Decision Intelligence" branding the Policy explicitly killed in favor of "Decision Operating System").
- **Not changed — Investor/Customer/Team narratives**: these are pitch-deck-level strategic language, not homepage copy the Policy prescribes for this specific artifact. The existing Company Memory section ("Your organization becomes smarter. Not the AI... institutional intelligence") is already thematically aligned with the frozen Customer Narrative without being a verbatim match — left as-is rather than force a rewrite the Policy doesn't actually require here.
- **Not changed — network effects / "40 hours" / LinkedIn-maturity claims**: the Policy's three "Mandatory Changes v2.0 → v2.1" retire specific investor-deck/pitch language that was never present anywhere in this site's copy to begin with (verified by search) — nothing to fix here.
- **Deferred, not built — the Policy's "L4 Policy Engine"**: the "Seven-Layer Stack" architecture names a new layer between the Decision Engine and Execution ("Policy Check... Configurable rules (JSON)") required as of V1/MVP, not deferred to a later phase like the Bible's own Pinecone/cold-start item. This has no existing counterpart anywhere in the built system (the ICP editor is the closest analog, but it scores fit, it doesn't gate/approve actions) — it's a genuine new subsystem, not a content fix, and out of scope for a same-pass content/GTM alignment update. Flagged here as the next real engineering priority.

## Design System

### Colors (from Bible §1.2 visual identity)
- **Obsidian** `#0A0E17` — Primary background, the "unknown" before decision
- **Graphite** `#111827` — Cards, surfaces, elevation
- **Amber Evidence** `#D97706` — CTAs, key insights, the moment of illumination
- **Slate Reasoning** `#374151` — Connective tissue between data points
- **White Clarity** `#F3F4F6` — The decision itself, clear and sharp
- **Signal Green** `#059669` — Outcomes, positive memory
- **Alert Rust** `#DC2626` — Bad decisions, pipeline leaks

### Typography
- **Inter** — Body, headlines (weight 400 display, 600 strong)
- **JetBrains Mono** — Evidence, verdicts, confidence scores, timestamps

### Icons (Argus Glyphs)
Custom SVG set, 1.5px stroke, no fill. Each glyph maps to one of the Five Graphs:
- Evidence (concentric circles with rays) — The Panoptes
- Decision (triangle with weight) — Weighted scoring
- Action (structure with paths) — Decisions become actions
- Outcome (growth arc) — Ground truth feeding back
- Learning (stacked planes) — Pattern extraction

## Stack

- **Next.js 14** (App Router) — Bible §7.2
- **TypeScript** — Type safety
- **Tailwind CSS** — Utility-first styling
- **Framer Motion** — Scroll-triggered reveals
- **Lucide React** — Only for internal UI (not customer-facing)

## Deploy

```bash
npm install
npm run build
# Static export to ./dist
```

**Vercel project ("argusos") gotcha, found 2026-07-17**: this project's Root
Directory is `.` (the monorepo root), not `apps/website` -- so
`buildCommand`/`installCommand` must NOT `cd ../..` (that escapes the repo
entirely, causing a "no package-lock.json found" `npm ci` failure) and
`outputDirectory` must be the full path `apps/website/dist`, not just
`dist`. Framework Preset is set to "Other" (not "Next.js"): Vercel's actual
Next.js Runtime always expects a `routes-manifest.json` file (an SSR-only
artifact) even when Output Directory is overridden, which a static
`output: 'export'` build never produces -- "Other" serves the exported
static files directly instead of running that Next-specific check.

## Structure

```
app/
  layout.tsx      — Root layout with fonts, metadata
  page.tsx        — Landing page (all sections)
  globals.css     — Design tokens, scrollbar, selection
components/
  Logo.tsx        — Argus Peacock Glyph
  EvidenceField.tsx — Background grid + floating nodes
  Navigation.tsx  — Fixed nav with Evidence/Reasoning/Outcomes/Memory
  HeroSection.tsx — The Promise (Act 1)
  FiveGraphsSection.tsx — The Five Graphs (Act 2)
  VerdictSpectrumSection.tsx — Verdict Spectrum (Act 3)
  CompanyMemorySection.tsx — Company Memory (Act 4)
  CTASection.tsx  — Three Entry Paths (Act 5)
  Footer.tsx      — North Star quote
```

## What This Is NOT

- No generic SaaS template (no 3D characters, no gradient sludge)
- No "AI-powered" marketing fluff ("AI" only in technical contexts)
- No demo request form or gated content — the four plan tiers and their prices are shown directly (Bible §13.2)
- No logo wall (evidence-based, not social-proof-by-association)
- No chat widget (ARGUS does not need a chatbot on its own site)

## Known gaps (flagged, not hidden)

- `next@14.2.5` has a disclosed security vulnerability (npm flags it on install: https://nextjs.org/blog/security-update-2025-12-11). Not upgraded here — this workspace is integrated as-is per explicit instruction (no redesign/rebuild), and a Next.js major-version bump is its own separate task, not a drive-by change alongside a content audit. Same disclosure philosophy as the root README's own transitive `postcss` vulnerability note.
- The Policy v2.1 Three Entry Paths GTM pricing (Free Decision Assessment $0 / Intelligence Sprint $7,500 / Enterprise Engagement $25,000+) is no longer shown anywhere on this page — the homepage's CTA slot shows the Bible's §13.2 SaaS tiers instead (see "Policy v2.1 alignment" above). This is a deliberate, explicit 2026-07-17 decision: the GTM entry-path motion (and its $7,500/$25,000+ price points) is deferred until the Phase 3 enterprise engagement is actually built out, not abandoned. Worth a `/pricing` sub-page once this site grows beyond one page.
- The Policy's L4 "Policy Engine" (configurable governance rules gating an action before execution) has no counterpart anywhere in the built system yet — see "Policy v2.1 alignment" above. This is the next real engineering gap, not a content one.
- ~~The `mailto:` CTAs...~~ superseded 2026-07-17: all CTAs now link directly to the real dashboard's sign-up (`apps/dashboard`) instead of `mailto:` — see "ARGUS OS Brand Guidelines v1.0" below for the same-day rebrand.
- **Satoshi (Brand v1.0's primary typeface) isn't actually rendering right now.** `layout.tsx` links Fontshare's official Satoshi CSS (`api.fontshare.com/v2/css?f[]=satoshi...`), which is the only legitimate distribution channel (Satoshi isn't on Google Fonts / Fontsource, so it can't self-host via `next/font`) — but as of 2026-07-17 that endpoint returns `"Access to the Fontshare API has been temporarily restricted"` for this deployment, not a bug in the integration itself. The site correctly falls back to the brand doc's own specified stack (`system-ui, -apple-system, "Segoe UI", sans-serif`), so nothing is visually broken, but the actual Satoshi glyphs aren't loading — visitors see their OS's default UI font instead. Should self-resolve once Fontshare's restriction lifts; re-check `document.fonts` in a live browser if this needs re-verifying.

## ARGUS OS Brand Guidelines v1.0 (2026-07-17 rebrand)

A new official brand package (guidelines PDF + primary/monochrome/app-icon/motion-identity SVGs) fully supersedes the Bible §1.2 visual identity this site originally launched with (Obsidian/Amber palette, Peacock Glyph) — same "newer governing document wins" pattern as the Policy v2.1 pricing override, except this time for the whole visual identity, not just pricing.

- **Palette**: every existing color token name (`obsidian`, `graphite`, `slate`, `ash`, `pearl`, `amber`, `signal`, `wait`, `pass`, `hard-pass`) kept its class name but got a new hex value in `tailwind.config.ts` — no rename across the codebase, just new colors under the hood. Two new tokens added: `teal`/`teal-glow` (Brand Teal `#00D1C8`/`#00F5E8`, the new primary accent for evidence/AI/section-labels/hover-states). Amber (`#F5A623`, updated hex) is now reserved specifically for CTA buttons and the verdict-highlight price display, per the brand doc's own role split ("Amber: CTA, verdict highlight" vs. "Teal: primary accent, evidence, AI").
- **Verdict colors**: Brand v1.0 §7 only defines 4 verdict tiers (STRONG YES `#00F5E8` / YES `#00D1C8` / WAIT `#00A8E8` / PASS `#2A3A4E`, described as "core fades to void") where this site has 5. STRONG YES/YES/WAIT map directly; the brand's PASS ("void") reads as the *worst* end of the scale, so it was mapped to this site's HARD_PASS (the true give-up state) rather than its own PASS, with an intermediate shade (`#3D4F63`) derived for PASS itself.
- **Logo**: `Logo.tsx` (and `apps/dashboard`'s own copy) now renders the Argus V — two arms converging at a single point, the verdict — copied from the brand package's `argus_v_logo_primary.svg`. Same asset also became `app/icon.svg` (favicon) using the more compact `argus_v_app_icon.svg` variant.
- **No green left**: the brand's 5-token system (Teal/Navy/White/Gray/Amber) has no separate "positive outcome" color, so `signal` was unified into Teal itself rather than keeping a distinct green Bible §1.2 had.
- **Not changed**: the frozen Policy v2.1 tagline/copy ("Stop guessing. Start deciding with evidence.", "Know why before you act — every time.") — that's a separate governing document from the Brand Guidelines, and this rebrand's scope was visual identity, not copy. The brand doc's own new tagline ("See Right. Decide Right. Win More.") is available if a future copy update wants it, but wasn't applied here without a separate decision.
