import { prisma, type Prospect } from "@argus/database";
import { enrichOrganizationByDomain, type ApolloOrganization } from "./apollo-client.js";
import { enrichCompanyByDomain, type ClearbitCompany } from "./clearbit-client.js";
import { logger } from "../logger.js";

// Bible §9.1 Prospect.lastEnrichedAt — re-enriching every single decision
// on the same prospect would burn Apollo/Clearbit API quota for data that
// barely changes day to day. 30 days matches the kind of firmographic
// staleness window company enrichment data actually needs (headcount,
// funding stage), as distinct from the 90-day *evidence* recency window
// the agent prompts use for behavioral/intent signals (Bible §8.3-§8.5).
const STALENESS_MS = 30 * 24 * 60 * 60 * 1000;

export interface EnrichmentResult {
  prospect: Prospect;
  apollo: ApolloOrganization | null;
  clearbit: ClearbitCompany | null;
}

function isFresh(prospect: Prospect): boolean {
  return Boolean(
    prospect.lastEnrichedAt &&
      Date.now() - prospect.lastEnrichedAt.getTime() < STALENESS_MS,
  );
}

function formatFunding(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

/**
 * Bible §16.1 Risk #4 ("Apollo.io/Clearbit API failures"): "Fallback to
 * LinkedIn-only mode... Degrade gracefully with warning; allow manual
 * data entry" — an enrichment failure must never block decision creation.
 * Each provider is called independently via allSettled so one failing
 * doesn't take down the other, and any failure just leaves the prospect's
 * existing (possibly LinkedIn-only) data in place.
 */
export async function enrichProspect(prospect: Prospect): Promise<EnrichmentResult> {
  if (!prospect.companyDomain || isFresh(prospect)) {
    return { prospect, apollo: null, clearbit: null };
  }

  const [apolloResult, clearbitResult] = await Promise.allSettled([
    enrichOrganizationByDomain(prospect.companyDomain),
    enrichCompanyByDomain(prospect.companyDomain),
  ]);

  const apollo = apolloResult.status === "fulfilled" ? apolloResult.value : null;
  if (apolloResult.status === "rejected") {
    logger.warn(
      { err: apolloResult.reason, prospectId: prospect.id },
      "Apollo enrichment failed; degrading to existing data (Bible §16.1 Risk #4)",
    );
  }

  const clearbit = clearbitResult.status === "fulfilled" ? clearbitResult.value : null;
  if (clearbitResult.status === "rejected") {
    logger.warn(
      { err: clearbitResult.reason, prospectId: prospect.id },
      "Clearbit enrichment failed; degrading to existing data (Bible §16.1 Risk #4)",
    );
  }

  if (!apollo && !clearbit) {
    return { prospect, apollo: null, clearbit: null };
  }

  const companySize =
    apollo?.estimatedNumEmployees != null
      ? String(apollo.estimatedNumEmployees)
      : clearbit?.employees != null
        ? String(clearbit.employees)
        : prospect.companySize;

  const companyIndustry = apollo?.industry ?? clearbit?.industry ?? prospect.companyIndustry;

  const companyFunding =
    apollo?.totalFunding != null
      ? formatFunding(apollo.totalFunding)
      : clearbit?.raised != null
        ? formatFunding(clearbit.raised)
        : prospect.companyFunding;

  const updated = await prisma.prospect.update({
    where: { id: prospect.id },
    data: {
      companySize,
      companyIndustry,
      companyFunding,
      enrichedData: { apollo, clearbit } as never,
      lastEnrichedAt: new Date(),
    },
  });

  return { prospect: updated, apollo, clearbit };
}
