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

export interface ExtractedProfile {
  linkedInUrl: string;
  name: string | null;
  title: string | null;
  companyName: string | null;
}

export function extractProfileFromDom(): ExtractedProfile {
  return {
    linkedInUrl: window.location.href.split("?")[0] ?? window.location.href,
    name: firstMatch(NAME_SELECTORS),
    title: firstMatch(TITLE_SELECTORS),
    companyName: firstMatch(COMPANY_SELECTORS),
  };
}
