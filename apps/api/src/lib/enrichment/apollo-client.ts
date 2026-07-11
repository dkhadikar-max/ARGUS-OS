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
