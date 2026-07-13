import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Bible §5.3/§9.1 ICPDefinition -- a real seeded ICP so the ICP Agent
// (§8.4) has something to actually score against instead of the `null`
// {{team_icp}} placeholder every prior seeded/live decision ran with.
// Field names match apps/dashboard's IcpCriteriaEditor.tsx ICP_FIELD_OPTIONS
// exactly (real Prospect model attributes, not invented ones). Weights sum
// to exactly 1.0, matching icpWeightsAreValid's tolerance.
const DEFAULT_ICP_CRITERIA = [
  { field: "companySize", operator: "gte" as const, value: 50, weight: 0.3 },
  { field: "companyIndustry", operator: "in" as const, value: ["SaaS", "Software", "Technology"], weight: 0.3 },
  { field: "title", operator: "contains" as const, value: "VP", weight: 0.2 },
  { field: "companyFunding", operator: "in" as const, value: ["Series A", "Series B", "Series C"], weight: 0.2 },
];

// Bible §19.1 QA Checklist "All 5 verdict states render" -- minimal dev seed
// covering one Decision per Verdict enum value, attached to the first Team/
// User found in the DB (whatever local dev account is already signed in),
// so `npm run db:seed` gives an immediately-checkable Today Queue without
// needing a live Claude call per verdict.
const SEED_DECISIONS: Array<{
  prospect: { name: string; title: string; companyName: string; companyDomain: string; linkedInUrl: string };
  verdict: "STRONG_YES" | "YES" | "WAIT" | "PASS" | "HARD_PASS";
  confidence: number;
  weightedScore: number;
  reasoning: string;
  recommendedAction: string;
  agentConsensus: string;
  evidence: Array<{ type: string; source: string; signal: string; relevance: string; confidence: number }>;
  message: string | null;
}> = [
  {
    prospect: {
      name: "Priya Nair",
      title: "VP of Revenue Operations",
      companyName: "Northwind Analytics",
      companyDomain: "northwindanalytics.com",
      linkedInUrl: "https://www.linkedin.com/in/seed-priya-nair/",
    },
    verdict: "STRONG_YES",
    confidence: 92,
    weightedScore: 95,
    reasoning:
      "Textbook ICP match: VP-level buyer at a Series B SaaS company that just posted three RevOps roles and recently adopted a competing tool. Every agent converged with no conflicts.",
    recommendedAction: "message_now",
    agentConsensus: "high",
    evidence: [
      { type: "FIRMOGRAPHIC", source: "APOLLO", signal: "Series B, 180 employees, RevTech vertical", relevance: "Matches ICP company-size and vertical criteria", confidence: 88 },
      { type: "INTENT", source: "LINKEDIN", signal: "3 open RevOps job postings in the last 14 days", relevance: "Strong buying-team-expansion signal", confidence: 91 },
    ],
    message: "Hi Priya — noticed Northwind's been growing the RevOps team fast this month. Worth a quick chat about how teams your size are cutting time wasted on low-probability prospects?",
  },
  {
    prospect: {
      name: "Marcus Webb",
      title: "Director of Sales",
      companyName: "Fieldstone Logistics",
      companyDomain: "fieldstonelogistics.com",
      linkedInUrl: "https://www.linkedin.com/in/seed-marcus-webb/",
    },
    verdict: "YES",
    confidence: 78,
    weightedScore: 82,
    reasoning:
      "Solid ICP fit and a director-level title with real budget authority, but intent signals are moderate — no recent job postings or funding news, just steady headcount growth.",
    recommendedAction: "message_now",
    agentConsensus: "high",
    evidence: [
      { type: "FIRMOGRAPHIC", source: "APOLLO", signal: "120 employees, logistics/supply-chain vertical", relevance: "Within ICP company-size band", confidence: 74 },
      { type: "INTENT", source: "LINKEDIN", signal: "Steady 8% headcount growth over 6 months, no acute trigger", relevance: "Positive but not urgent signal", confidence: 62 },
    ],
    message: "Hi Marcus — Fieldstone's growth caught my eye. Curious how your team currently decides which inbound leads are worth chasing vs. which waste a rep's afternoon?",
  },
  {
    prospect: {
      name: "Dana Kowalski",
      title: "Head of Growth",
      companyName: "Ledger & Loom",
      companyDomain: "ledgerandloom.com",
      linkedInUrl: "https://www.linkedin.com/in/seed-dana-kowalski/",
    },
    verdict: "WAIT",
    confidence: 58,
    weightedScore: 63,
    reasoning:
      "Agents disagreed: ICP agent scored this highly on title and company stage, but the Risk agent flagged that Ledger & Loom announced a hiring freeze last month, and Intent found no engagement signals at all. Recommend waiting for a clearer trigger before reaching out.",
    recommendedAction: "wait_for_signal",
    agentConsensus: "medium",
    evidence: [
      { type: "FIRMOGRAPHIC", source: "APOLLO", signal: "Head of Growth title, Series A fintech", relevance: "Good title/stage match", confidence: 70 },
      { type: "DERIVED", source: "INFERRED", signal: "Company announced a hiring freeze 3 weeks ago", relevance: "Budget likely constrained right now", confidence: 65 },
    ],
    message: null,
  },
  {
    prospect: {
      name: "Ellis Tran",
      title: "Marketing Coordinator",
      companyName: "Bright Path Media",
      companyDomain: "brightpathmedia.com",
      linkedInUrl: "https://www.linkedin.com/in/seed-ellis-tran/",
    },
    verdict: "PASS",
    confidence: 81,
    weightedScore: 38,
    reasoning:
      "Title is too junior for the buying committee this product targets, and Bright Path Media is a 12-person agency well outside the ICP's company-size band. No intent signals to offset the fit gap.",
    recommendedAction: "pass_and_move_on",
    agentConsensus: "high",
    evidence: [
      { type: "FIRMOGRAPHIC", source: "APOLLO", signal: "12 employees, marketing agency vertical", relevance: "Below ICP minimum company size", confidence: 80 },
      { type: "DEMOGRAPHIC", source: "LINKEDIN", signal: "Coordinator-level title, not a budget holder", relevance: "Lacks purchasing authority", confidence: 85 },
    ],
    message: null,
  },
  {
    prospect: {
      name: "Test Bot Account",
      title: "N/A",
      companyName: "QA Sandbox Corp",
      companyDomain: "example.com",
      linkedInUrl: "https://www.linkedin.com/in/seed-qa-sandbox/",
    },
    verdict: "HARD_PASS",
    confidence: 96,
    weightedScore: 8,
    reasoning:
      "All available fields are placeholder/test values (\"N/A\" title, example.com domain). No real company or buyer exists here — this is a synthetic record, not a live prospect.",
    recommendedAction: "pass_and_move_on",
    agentConsensus: "high",
    evidence: [
      { type: "DERIVED", source: "INFERRED", signal: "Company domain is example.com, a reserved placeholder domain", relevance: "Definitive signal this is not a real company", confidence: 97 },
    ],
    message: null,
  },
];

async function main() {
  const team = await prisma.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (!team) {
    throw new Error("No Team found — sign in at least once (so the Clerk webhook/manual provisioning creates a Team) before running the seed.");
  }
  const user = await prisma.user.findFirst({ where: { teamId: team.id }, orderBy: { createdAt: "asc" } });
  if (!user) {
    throw new Error(`Team ${team.id} has no User — this shouldn't be possible given the schema's required relation.`);
  }

  const existingIcp = await prisma.iCPDefinition.findUnique({ where: { teamId: team.id } });
  if (existingIcp) {
    console.log(`ICP already exists for team "${team.name}" — skipping.`);
  } else {
    await prisma.iCPDefinition.create({
      data: { teamId: team.id, criteria: DEFAULT_ICP_CRITERIA as never, version: 1 },
    });
    console.log(`Created default ICP for team "${team.name}".`);
  }

  console.log(`Seeding 5 decisions (one per verdict) for team "${team.name}" (${team.id}), user ${user.id}...`);

  for (const seed of SEED_DECISIONS) {
    const existing = await prisma.prospect.findUnique({ where: { linkedInUrl: seed.prospect.linkedInUrl } });
    const prospect =
      existing ??
      (await prisma.prospect.create({
        data: {
          linkedInUrl: seed.prospect.linkedInUrl,
          name: seed.prospect.name,
          title: seed.prospect.title,
          companyName: seed.prospect.companyName,
          companyDomain: seed.prospect.companyDomain,
        },
      }));

    const alreadyDecided = await prisma.decision.findFirst({ where: { prospectId: prospect.id, teamId: team.id } });
    if (alreadyDecided) {
      console.log(`  Skipping ${seed.prospect.name} (${seed.verdict}) — decision already seeded`);
      continue;
    }

    await prisma.decision.create({
      data: {
        userId: user.id,
        teamId: team.id,
        prospectId: prospect.id,
        verdict: seed.verdict,
        confidence: seed.confidence,
        weightedScore: seed.weightedScore,
        reasoning: seed.reasoning,
        recommendedAction: seed.recommendedAction,
        agentConsensus: seed.agentConsensus,
        processingTimeMs: 4200,
        evidence: {
          create: seed.evidence.map((e) => ({
            type: e.type as never,
            source: e.source as never,
            data: { signal: e.signal, relevance: e.relevance },
            confidence: e.confidence,
            prospect: { connect: { id: prospect.id } },
          })),
        },
        ...(seed.message
          ? {
              messageDrafts: {
                create: [
                  {
                    userId: user.id,
                    channel: "LINKEDIN",
                    body: seed.message,
                    tone: "professional",
                    personalizationHooks: [],
                  },
                ],
              },
            }
          : {}),
      },
    });
    console.log(`  Created ${seed.prospect.name} — ${seed.verdict}`);
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
