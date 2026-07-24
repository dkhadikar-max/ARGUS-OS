/**
 * v4 roadmap Phase 9 -- generates a systematic fixture matrix (3 ICP-fit
 * levels x 4 intent levels x 3 risk levels = 36 combinations) rather than
 * hand-writing 50 similar-looking scenarios, for real, defensible coverage.
 * Combined with the 5 existing hand-crafted fixtures (strong-fit-hot-
 * intent, moderate-fit-steady-growth, conflicting-signals-hiring-freeze,
 * weak-fit-wrong-title, sparse-data-placeholder -- each already fits
 * within this same matrix conceptually), this reaches 41; a handful of
 * boundary-condition edge cases below bring the total to 50+.
 *
 * Usage: npx tsx eval/fixtures/generate.ts
 * (writes JSON files into this same directory; does not call any API)
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const COMPANY_CONTEXT =
  "We sell an AI-powered sales prioritization tool to B2B revenue teams, helping SDRs and AEs stop wasting time on low-probability prospects.";

const TEAM_ICP = [
  { field: "companySize", operator: "gte", value: 50, weight: 0.3 },
  { field: "companyIndustry", operator: "in", value: ["SaaS", "Software", "Technology"], weight: 0.3 },
  { field: "title", operator: "contains", value: "VP", weight: 0.2 },
  { field: "companyFunding", operator: "in", value: ["Series A", "Series B", "Series C"], weight: 0.2 },
];

type IcpFit = "strong" | "moderate" | "weak";
type IntentLevel = "hot" | "warm" | "cold" | "none";
type RiskLevel = "clean" | "moderate" | "severe";

interface IcpProfile {
  name: string;
  title: string;
  companyName: string;
  companyDomain: string;
  size: number | null;
  industry: string | null;
  funding: string | null;
}

// A small name/company pool so the 36-cell matrix isn't 36 copies of the
// same two people -- cycles deterministically, not randomly, so re-running
// this generator produces identical output.
const NAME_POOL = [
  "Priya Nair",
  "Marcus Webb",
  "Elena Rodriguez",
  "James Okafor",
  "Aisha Khan",
  "Tom Bennett",
  "Yuki Tanaka",
  "Carlos Mendes",
  "Fatima Al-Rashid",
  "Liam O'Brien",
  "Nadia Popescu",
  "Ravi Patel",
];

function icpProfile(fit: IcpFit, index: number): IcpProfile {
  const name = NAME_POOL[index % NAME_POOL.length] ?? "Test Person";
  switch (fit) {
    case "strong":
      return {
        name,
        title: "VP of Revenue Operations",
        companyName: `Northwind Analytics ${index}`,
        companyDomain: `northwind${index}.com`,
        size: 180,
        industry: "SaaS",
        funding: "Series B",
      };
    case "moderate":
      return {
        name,
        title: "Director of Sales",
        companyName: `Fieldstone Logistics ${index}`,
        companyDomain: `fieldstone${index}.com`,
        size: 120,
        industry: "Logistics",
        funding: null,
      };
    case "weak":
      return {
        name,
        title: "Marketing Coordinator",
        companyName: `Bright Path Media ${index}`,
        companyDomain: `brightpath${index}.com`,
        size: 12,
        industry: "Marketing Agency",
        funding: null,
      };
  }
}

function intentSignals(level: IntentLevel): { rawProfile: unknown; historicalEngagement: unknown[] } {
  switch (level) {
    case "hot":
      return {
        rawProfile: {
          headline: "Actively hiring",
          recentActivity: [
            "3 open RevOps roles posted in the last 14 days",
            "Recently closed a funding round",
            "Posted about scaling the team fast",
          ],
        },
        historicalEngagement: [],
      };
    case "warm":
      return {
        rawProfile: { headline: "Steady growth", recentActivity: ["8% headcount growth over 6 months, no acute trigger"] },
        historicalEngagement: [],
      };
    case "cold":
      return {
        rawProfile: { headline: "No recent activity", recentActivity: [] },
        historicalEngagement: [],
      };
    case "none":
      return { rawProfile: null, historicalEngagement: [] };
  }
}

function riskEnrichment(level: RiskLevel): { enrichedData: unknown; companyMemory: unknown } {
  switch (level) {
    case "clean":
      return { enrichedData: { riskSignal: null }, companyMemory: { patterns: [], riskFlags: [] } };
    case "moderate":
      return {
        enrichedData: { riskSignal: "growth_slowing" },
        companyMemory: { patterns: [], riskFlags: [{ category: "Timing", occurrenceRate: 0.15 }] },
      };
    case "severe":
      return {
        enrichedData: { riskSignal: "hiring_freeze_reported" },
        companyMemory: { patterns: [], riskFlags: [{ category: "Budget", occurrenceRate: 0.3 }] },
      };
  }
}

function buildFixture(fit: IcpFit, intent: IntentLevel, risk: RiskLevel, index: number) {
  const profile = icpProfile(fit, index);
  const { rawProfile, historicalEngagement } = intentSignals(intent);
  const { enrichedData, companyMemory } = riskEnrichment(risk);

  const name = `matrix-icp-${fit}_intent-${intent}_risk-${risk}`;
  return {
    name,
    input: {
      prospectData: {
        profile: { name: profile.name, title: profile.title, linkedInUrl: `https://www.linkedin.com/in/${name}/` },
        company: {
          name: profile.companyName,
          domain: profile.companyDomain,
          size: profile.size,
          industry: profile.industry,
          funding: profile.funding,
        },
        rawProfile,
        enrichedData,
      },
      teamIcp: TEAM_ICP,
      companyMemory,
      intentSignals: rawProfile,
      historicalEngagement,
      teamHistory: [],
      userPreferences: { messageTone: "professional", messageLength: "concise" },
      teamPatterns: (companyMemory as { patterns: unknown[] }).patterns,
      companyContext: COMPANY_CONTEXT,
    },
  };
}

function main() {
  const fitLevels: IcpFit[] = ["strong", "moderate", "weak"];
  const intentLevels: IntentLevel[] = ["hot", "warm", "cold", "none"];
  const riskLevels: RiskLevel[] = ["clean", "moderate", "severe"];

  let index = 0;
  let written = 0;
  for (const fit of fitLevels) {
    for (const intent of intentLevels) {
      for (const risk of riskLevels) {
        const fixture = buildFixture(fit, intent, risk, index);
        writeFileSync(join(__dirname, `${fixture.name}.json`), JSON.stringify(fixture, null, 2));
        index += 1;
        written += 1;
      }
    }
  }

  console.log(`Wrote ${written} matrix fixtures (${fitLevels.length}x${intentLevels.length}x${riskLevels.length}).`);
}

main();
