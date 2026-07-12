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
| §13.2 — Pricing Tiers | CTASection: Free/Starter/Pro/Enterprise, exact seat/decision caps (dollar amounts omitted, see audit notes below) |
| Closing epigraph (p.73) | Footer: "Every decision is a node. Every node is a lesson." |
| §3.4 — Feature-to-JTBD mapping | Hero copy: "analyze evidence, explain reasoning, learn from outcomes" |

## Bible-compliance audit (integration into the monorepo)

Audited section-by-section against the actual 73-page ARGUS AI v3.0 Product Bible before integration. Findings:

- **Verified accurate**: Five Graphs names/descriptions (§5.1), Verdict Spectrum's five confidence ranges (§8.7 — 90-100/70-89/50-69/30-49/0-29), Company Memory's pattern/risk-flag examples (§6.3, lifted near-verbatim from the Bible's own mockup), the hero's weighted-scoring formula and "&lt;10s verdict" claim, and the footer's closing epigraph (verbatim match to the Bible's final page).
- **Fixed — broken anchor**: `Navigation.tsx`'s "Outcomes" link pointed to `#outcomes`, but no section had that id. `FiveGraphsSection.tsx`'s Outcome Graph card now carries `id="outcomes"`.
- **Fixed — product name**: page `<title>`/OG metadata said "ARGUS" (dropping "AI"); the Bible's canonical product name is "ARGUS AI" (cover page), which the footer already used correctly.
- **Fixed — CTA had no basis in the Bible**: the previous CTA sold a "$7,500 Revenue Sprint" audit, attributed in this file to "§12.3 Meta-Play cold outreach." Reading §12.3 directly: the real Meta-Play experiment is Argus prospecting sales leaders and offering them a *14-day free trial*, not a paid audit — there is no "$7,500" figure anywhere in the Bible. `CTASection.tsx` now shows the Bible's actual plan structure (§13.2: Free / Starter / Pro / Enterprise, with exact seat and decision caps), reusing the same bordered-grid-of-cards pattern `VerdictSpectrumSection` already established rather than introducing a new layout. **Dollar amounts are deliberately omitted for now** (per explicit instruction) even though §13.2 does specify them ($0/$49/$149/$499) — only plan names, seat counts, and decision caps are shown. The Hero and Nav CTA buttons ("Begin the Audit" / "Request Audit") were updated to "Start Free" to match, and both now link to `#plans` instead of `#audit`.

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
  CTASection.tsx  — Plans (Act 5)
  Footer.tsx      — North Star quote
```

## What This Is NOT

- No generic SaaS template (no 3D characters, no gradient sludge)
- No "AI-powered" marketing fluff ("AI" only in technical contexts)
- No demo request form or gated content — plans and the free tier are shown directly (Bible §13.2)
- No logo wall (evidence-based, not social-proof-by-association)
- No chat widget (ARGUS does not need a chatbot on its own site)

## Known gaps (flagged, not hidden)

- `next@14.2.5` has a disclosed security vulnerability (npm flags it on install: https://nextjs.org/blog/security-update-2025-12-11). Not upgraded here — this workspace is integrated as-is per explicit instruction (no redesign/rebuild), and a Next.js major-version bump is its own separate task, not a drive-by change alongside a content audit. Same disclosure philosophy as the root README's own transitive `postcss` vulnerability note.
- Dollar amounts for the four plans are deliberately withheld right now (see the Bible-compliance audit above) even though Bible §13.2 fully specifies them. Whoever owns pricing decisions should confirm before adding real numbers back.
- The `mailto:` CTAs (`hello@argusos.com`, `sales@argusos.com`) are placeholder addresses, not verified-live inboxes — same category as the original site's `audit@argusos.com`, just carried forward under the corrected copy.
