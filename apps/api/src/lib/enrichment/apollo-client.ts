import { env } from "../../config/env.js";

// Bible §18 AI-2 "Apollo.io API integration" (P0), §7.1 system diagram
// ("Apollo.io (enrich)" in the Third-Party APIs box).
//
// Verified against Apollo's own current API reference (docs.apollo.io,
// fetched directly — not assumed from training data): base URL
// `https://api.apollo.io/api/v1`, authenticated via an `x-api-key`
// request header (not a bearer token or query param, despite some older
// third-party tutorials showing that).
const APOLLO_BASE_URL = "https://api.apollo.io/api/v1";

export interface ApolloOrganization {
  industry: string | null;
  estimatedNumEmployees: number | null;
  totalFunding: number | null;
  latestFundingRoundDate: string | null;
}

interface ApolloOrganizationEnrichResponse {
  organization?: {
    industry?: string;
    estimated_num_employees?: number;
    total_funding?: number;
    latest_funding_round_date?: string;
  };
}

/** Returns null when Apollo isn't configured or has no data for this
 *  domain; throws on a genuine API failure so the caller can decide how
 *  to degrade (Bible §16.1 Risk #4). */
export async function enrichOrganizationByDomain(
  domain: string,
): Promise<ApolloOrganization | null> {
  if (!env.APOLLO_API_KEY) return null;

  const url = `${APOLLO_BASE_URL}/organizations/enrich?domain=${encodeURIComponent(domain)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { "x-api-key": env.APOLLO_API_KEY },
  });

  if (response.status === 404) return null; // no matching organization

  if (!response.ok) {
    throw new Error(`Apollo organization enrichment failed with status ${response.status}`);
  }

  const body = (await response.json()) as ApolloOrganizationEnrichResponse;
  if (!body.organization) return null;

  return {
    industry: body.organization.industry ?? null,
    estimatedNumEmployees: body.organization.estimated_num_employees ?? null,
    totalFunding: body.organization.total_funding ?? null,
    latestFundingRoundDate: body.organization.latest_funding_round_date ?? null,
  };
}

// Bible §18 AI-2 also names person-level fields explicitly ("verified
// title, seniority, email") as distinct from the company-level firmographics
// above -- something a LinkedIn scrape can partially cover (title) but can
// never cover at all (email; LinkedIn doesn't expose it on a profile page).
//
// Endpoint and request-param names (`linkedin_url`, snake_case throughout)
// were confirmed directly against Apollo's own docs (docs.apollo.io/
// reference/people-enrichment): `POST /api/v1/people/match`. Apollo's docs
// site is a JS-rendered app whose response-body schema didn't come through
// on a fetch (truncated before the example payload), so the exact response
// field names below are inferred from two things that *are* directly
// confirmed: (a) this same page's request-param convention, and (b) the
// sibling organizations/enrich endpoint's already-verified response
// convention (industry/estimated_num_employees/etc. -- i.e. Apollo mirrors
// its request-param names in its response bodies). Every field is read
// defensively (optional chaining, no throw on a missing/renamed field), so
// if a name here turns out to differ from Apollo's actual response, the
// affected field just degrades to null rather than crashing enrichment.
export interface ApolloPerson {
  title: string | null;
  seniority: string | null;
  email: string | null;
  emailStatus: string | null;
}

interface ApolloPersonMatchResponse {
  person?: {
    title?: string;
    seniority?: string;
    email?: string;
    email_status?: string;
  };
}

/** Returns null when Apollo isn't configured or has no match for this
 *  LinkedIn URL; throws on a genuine API failure so the caller can decide
 *  how to degrade (Bible §16.1 Risk #4), matching
 *  enrichOrganizationByDomain's contract. */
export async function enrichPersonByLinkedInUrl(
  linkedInUrl: string,
): Promise<ApolloPerson | null> {
  if (!env.APOLLO_API_KEY) return null;

  const url = `${APOLLO_BASE_URL}/people/match?linkedin_url=${encodeURIComponent(linkedInUrl)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "x-api-key": env.APOLLO_API_KEY },
  });

  if (response.status === 404) return null; // no matching person

  if (!response.ok) {
    throw new Error(`Apollo people enrichment failed with status ${response.status}`);
  }

  const body = (await response.json()) as ApolloPersonMatchResponse;
  if (!body.person) return null;

  return {
    title: body.person.title ?? null,
    seniority: body.person.seniority ?? null,
    email: body.person.email ?? null,
    emailStatus: body.person.email_status ?? null,
  };
}
