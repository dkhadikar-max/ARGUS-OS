import { env } from "../../config/env.js";

// Bible §18 AI-2 "Clearbit API integration" (P0), §7.1 system diagram
// ("Clearbit (firmo)").
//
// Clearbit's own public docs site now sits entirely behind a login wall
// (likely restructured after the 2023 HubSpot acquisition), and their
// official Node client is archived/deprecated. Rather than guess, this
// was verified against that client's actual source
// (github.com/clearbit/clearbit-node, src/client.js + src/enrichment/
// company.js) and its test fixture (test/fixtures/company.json) — which
// is how the auth mechanism turned out to be HTTP Basic (API key as
// username, empty password), not the `Authorization: Bearer` scheme a
// generic assumption would have reached for.
const CLEARBIT_BASE_URL = "https://company.clearbit.com/v2";

export interface ClearbitCompany {
  employees: number | null;
  raised: number | null;
  industry: string | null;
}

interface ClearbitCompanyResponse {
  employees?: number;
  raised?: number;
  categories?: string[];
  category?: { industry?: string };
  metrics?: { employees?: number; raised?: number };
}

function basicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

/** Returns null when Clearbit isn't configured or has no data for this
 *  domain; throws on a genuine API failure so the caller can decide how
 *  to degrade (Bible §16.1 Risk #4). */
export async function enrichCompanyByDomain(domain: string): Promise<ClearbitCompany | null> {
  if (!env.CLEARBIT_API_KEY) return null;

  const url = `${CLEARBIT_BASE_URL}/companies/find?domain=${encodeURIComponent(domain)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: basicAuthHeader(env.CLEARBIT_API_KEY) },
  });

  if (response.status === 404) return null; // no matching company

  if (!response.ok) {
    throw new Error(`Clearbit company enrichment failed with status ${response.status}`);
  }

  const body = (await response.json()) as ClearbitCompanyResponse;

  return {
    employees: body.employees ?? body.metrics?.employees ?? null,
    raised: body.raised ?? body.metrics?.raised ?? null,
    industry: body.category?.industry ?? body.categories?.[0] ?? null,
  };
}
