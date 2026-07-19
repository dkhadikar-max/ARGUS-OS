/**
 * Bible §16.2 Risk #1 ("LinkedIn UI changes break extension") mitigation:
 * a selector fallback library with 3+ candidates per element, tried in
 * order, rather than a single brittle selector. Full DOM-mutation-observer
 * based re-scraping and Apollo/Clearbit enrichment is AI-2 (§18 Epic 2,
 * Week 2) — this module covers only what EXT-1 needs to populate the
 * sidebar shell with a name/title/company good enough to send to the API.
 */

function firstMatch(selectors: string[]): string | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const text = el?.textContent?.trim();
    if (text) return text;
  }
  return null;
}

const NAME_SELECTORS = [
  "main h1",
  ".pv-text-details__left-panel h1",
  "[data-anonymize='person-name']",
  "h1.text-heading-xlarge",
];

const TITLE_SELECTORS = [
  ".pv-text-details__left-panel .text-body-medium",
  "[data-anonymize='headline']",
  "main .text-body-medium.break-words",
];

const COMPANY_SELECTORS = [
  "[data-anonymize='company-name']",
  "main a[href*='/company/'] span[aria-hidden='true']",
  "main a[href*='/company/']",
];

export type ProfilePageType = "personal" | "company" | "recruiter" | "sales_nav" | null;

/** QA checklist §19.1: sidebar must appear on all profile variants. */
export function detectProfilePageType(url: string): ProfilePageType {
  if (/\/in\/[^/]+/.test(url)) return "personal";
  if (/\/company\/[^/]+/.test(url)) return "company";
  if (/\/talent\/profile/.test(url)) return "recruiter";
  if (/\/sales\/(lead|people)\//.test(url)) return "sales_nav";
  return null;
}

/**
 * LinkedIn's current personal-profile markup (observed live, 2026-07) has no
 * `<h1>` at all and every class name is an opaque content hash -- every
 * selector above misses. What survives a redesign is the *structure*: the
 * name is the lone heading (`<h1>`/`<h2>`) whose text exactly matches the
 * page's own title, and its headline/company/location are that heading's
 * nearest ancestor with 3+ siblings. A profile page is dense with *other*
 * links back to the same person (their own activity-feed posts, "people
 * also viewed" cards, etc.), which is why this anchors on the heading
 * rather than on any `<a href>` pointing at the profile's own URL -- that
 * matched a random feed item first and silently returned the wrong card.
 * Only runs when the selector-based attempt above has already failed.
 */
function findProfileCard(expectedName: string): Element | null {
  const headings = document.querySelectorAll("main h1, main h2");
  for (const heading of headings) {
    if (heading.textContent?.trim() !== expectedName) continue;

    let el: Element | null = heading;
    for (let i = 0; i < 8 && el; i++) {
      const parent: Element | null = el.parentElement;
      if (parent && parent.children.length >= 3) return parent;
      el = parent;
    }
    return null;
  }
  return null;
}

function extractNameFallback(pageType: ProfilePageType): string | null {
  if (pageType !== "personal") return null;
  // LinkedIn reliably titles personal profile tabs "Name | LinkedIn" even on
  // markup that gives no other stable hook.
  const [name] = document.title.split(" | ");
  return name?.trim() || null;
}

function extractTitleAndCompanyFallback(
  pageType: ProfilePageType,
  name: string | null,
): { title: string | null; companyName: string | null } {
  if (pageType !== "personal" || !name) return { title: null, companyName: null };

  const card = findProfileCard(name);
  if (!card) return { title: null, companyName: null };

  // Observed child order: [0] name+connection-degree, [1] headline,
  // [2] current company (plain text, no longer a /company/ link on this
  // layout), [3] location. Guarded individually since a profile missing a
  // headline or company still has the rest.
  const title = card.children[1]?.textContent?.trim() || null;
  const companyName = card.children[2]?.textContent?.trim() || null;
  return { title, companyName };
}

export interface ExtractedProfile {
  linkedInUrl: string;
  name: string | null;
  title: string | null;
  companyName: string | null;
}

export function extractProfileFromDom(): ExtractedProfile {
  const linkedInUrl = window.location.href.split("?")[0] ?? window.location.href;
  const pageType = detectProfilePageType(linkedInUrl);

  const name = firstMatch(NAME_SELECTORS) ?? extractNameFallback(pageType);
  const title = firstMatch(TITLE_SELECTORS);
  const companyName = firstMatch(COMPANY_SELECTORS);

  if (title !== null && companyName !== null) {
    return { linkedInUrl, name, title, companyName };
  }

  const fallback = extractTitleAndCompanyFallback(pageType, name);
  return {
    linkedInUrl,
    name,
    title: title ?? fallback.title,
    companyName: companyName ?? fallback.companyName,
  };
}
