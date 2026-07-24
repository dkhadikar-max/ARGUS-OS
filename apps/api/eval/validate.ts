/**
 * v4 roadmap Phase 9 -- validates the candidate benchmark harness (metrics.ts
 * + run-candidate.ts's manifest shape + compare-candidates.ts) against
 * synthetic AgentDebateOutput fixtures. Zero API cost: no orchestrator is
 * invoked, no network call is made. This is the "validate manifests and
 * metrics" item of Phase A, run before any real (paid) pilot.
 *
 * Usage: npx tsx eval/validate.ts
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentDebateOutput } from "@argus/shared";
import {
  computeConfidenceCalibrationFlag,
  computeDecisionValuePerDollar,
  computeEvidenceUtilization,
  computeInferenceCost,
  percentile,
} from "./metrics.js";
import type { CandidateRunManifest, CandidateRunResult } from "./types.js";
import type { DecisionAgentInput } from "../src/agents/orchestrator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
function check(label: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`  ok - ${label}`);
}

// --- percentile() -----------------------------------------------------

check("percentile: empty array returns 0", () => {
  assert.equal(percentile([], 50), 0);
});

check("percentile: p50/p95 on a known 10-element array", () => {
  const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(values, 50), 50);
  assert.equal(percentile(values, 95), 100);
});

check("percentile: single value returns that value for any p", () => {
  assert.equal(percentile([42], 50), 42);
  assert.equal(percentile([42], 95), 42);
});

// --- synthetic fixtures -------------------------------------------------

const richInput: DecisionAgentInput = {
  prospectData: {
    profile: { name: "Synthetic Rich", title: "VP of Sales", linkedInUrl: "https://www.linkedin.com/in/synthetic-rich/" },
    company: { name: "Rich Corp", domain: "richcorp.example", size: 200, industry: "SaaS", funding: "Series B" },
    rawProfile: { headline: "VP of Sales at Rich Corp", recentActivity: ["Posted about scaling outbound"] },
    enrichedData: { employeeCount: 200, industry: "SaaS", fundingStage: "Series B", riskSignal: "Recent layoffs in engineering" },
  },
  teamIcp: [{ field: "companySize", operator: "gte", value: 50, weight: 1 }],
  companyMemory: { patterns: [], riskFlags: [] },
  intentSignals: { headline: "VP of Sales at Rich Corp", recentActivity: ["Posted about scaling outbound"] },
  historicalEngagement: [],
  teamHistory: [],
  userPreferences: { messageTone: "professional", messageLength: "concise" },
  teamPatterns: [],
  companyContext: "Synthetic fixture for harness validation only.",
} as unknown as DecisionAgentInput;

function buildDebateOutput(overrides: { researchConfidence: number; dataGaps: number; judgeConfidence: number }): AgentDebateOutput {
  return {
    research: {
      summary: "Rich Corp posted about scaling outbound and shows recent layoffs in engineering as a risk signal.",
      data_points: [{ type: "firmographic", signal: "SaaS company size 200", relevance: "Matches ICP size band" }],
      unfair_advantages: [],
      hidden_risks: [],
      confidence: overrides.researchConfidence,
      data_gaps: Array.from({ length: overrides.dataGaps }, (_, i) => `gap-${i}`),
    },
    icp: {
      score: 80,
      criteria_evaluated: [{ criterion: "companySize", weight: 1, match: 1, evidence: "200 employees", reasoning: "Above threshold" }],
      overall_assessment: "Strong ICP fit for Rich Corp given SaaS industry and size.",
      edge_cases: [],
      confidence: 80,
    },
    intent: {
      score: 60,
      signals: [{ signal: "Posted about scaling outbound", raw_score: 6, weighted_score: 6, recency_days: 3, reasoning: "Recent, relevant" }],
      trajectory: "increasing",
      false_intent_flags: [],
      confidence: 70,
    },
    risk: {
      score: 40,
      risks: [{ category: "Stability", severity: "moderate", description: "Recent layoffs in engineering", evidence: "Recent layoffs in engineering", mitigation: "Confirm budget is unaffected" }],
      red_flags: [],
      time_waste_probability: 30,
      mitigation_strategies: [],
      confidence: 70,
    },
    judge: {
      verdict: "YES",
      confidence: overrides.judgeConfidence,
      weighted_score: 65,
      agent_consensus: "medium",
      conflicts: [],
      reasoning: "Strong ICP and increasing intent outweigh a moderate stability risk.",
      key_evidence: ["Posted about scaling outbound", "200 employees"],
      message: { linkedin: "Hi Synthetic, ...", email: "Hi Synthetic, ...", tone: "professional", personalization_hooks: [] },
      recommended_action: "message_now",
      confidence_explanation: "Consistent signals across ICP and Intent.",
    },
  };
}

// --- computeEvidenceUtilization ------------------------------------------

check("computeEvidenceUtilization: null when input has no signals", () => {
  const emptyInput = { prospectData: {} } as unknown as DecisionAgentInput;
  const result = computeEvidenceUtilization(emptyInput, buildDebateOutput({ researchConfidence: 80, dataGaps: 0, judgeConfidence: 60 }));
  assert.equal(result.totalSignals, 0);
  assert.equal(result.utilizationRate, null);
});

check("computeEvidenceUtilization: references found for industry/funding/activity/riskSignal", () => {
  const output = buildDebateOutput({ researchConfidence: 80, dataGaps: 0, judgeConfidence: 60 });
  const result = computeEvidenceUtilization(richInput, output);
  assert.equal(result.totalSignals, 4); // industry, funding, 1 recentActivity entry, riskSignal
  assert.ok(result.referencedCount >= 2, `expected at least 2 referenced signals, got ${result.referencedCount}`);
  assert.ok(result.utilizationRate !== null && result.utilizationRate > 0 && result.utilizationRate <= 1);
});

// --- computeConfidenceCalibrationFlag ------------------------------------

check("computeConfidenceCalibrationFlag: not sparse, rule trivially holds", () => {
  const output = buildDebateOutput({ researchConfidence: 80, dataGaps: 0, judgeConfidence: 90 });
  const flag = computeConfidenceCalibrationFlag(output);
  assert.equal(flag.consideredSparse, false);
  assert.equal(flag.ruleHeld, true);
});

check("computeConfidenceCalibrationFlag: sparse (low research confidence) + judge confidence < 70 holds the rule", () => {
  const output = buildDebateOutput({ researchConfidence: 30, dataGaps: 0, judgeConfidence: 55 });
  const flag = computeConfidenceCalibrationFlag(output);
  assert.equal(flag.consideredSparse, true);
  assert.equal(flag.ruleHeld, true);
});

check("computeConfidenceCalibrationFlag: sparse (data gaps) + judge confidence >= 70 breaks the rule", () => {
  const output = buildDebateOutput({ researchConfidence: 80, dataGaps: 3, judgeConfidence: 85 });
  const flag = computeConfidenceCalibrationFlag(output);
  assert.equal(flag.consideredSparse, true);
  assert.equal(flag.ruleHeld, false);
});

// --- computeInferenceCost / computeDecisionValuePerDollar ----------------

check("computeInferenceCost matches Bible §13.1's own worked example (~$0.042 for 4K in + 2K out)", () => {
  const cost = computeInferenceCost({ inputTokens: 4000, outputTokens: 2000 });
  assert.ok(Math.abs(cost - 0.042) < 0.0001, `expected ~0.042, got ${cost}`);
});

check("computeDecisionValuePerDollar: null ratio when cost is 0 (e.g. cache hit)", () => {
  const { valueCostRatio } = computeDecisionValuePerDollar("YES", 0);
  assert.equal(valueCostRatio, null);
});

check("computeDecisionValuePerDollar: positive ratio for a real cost", () => {
  const { decisionValueUsd, valueCostRatio } = computeDecisionValuePerDollar("YES", 0.05);
  assert.ok(decisionValueUsd > 0);
  assert.ok(valueCostRatio !== null && valueCostRatio > 0);
});

// --- CandidateRunManifest round-trip -------------------------------------

check("CandidateRunManifest: JSON round-trips through disk with the expected shape", () => {
  const output = buildDebateOutput({ researchConfidence: 80, dataGaps: 0, judgeConfidence: 60 });
  const usage = { inputTokens: 4000, outputTokens: 2000 };
  const inferenceCostUsd = computeInferenceCost(usage);
  const { decisionValueUsd, valueCostRatio } = computeDecisionValuePerDollar(output.judge.verdict, inferenceCostUsd);
  const evidence = computeEvidenceUtilization(richInput, output);
  const calibration = computeConfidenceCalibrationFlag(output);

  const result: CandidateRunResult = {
    fixture: "synthetic-validation-fixture",
    candidate: "pipeline-with-conflict",
    verdict: output.judge.verdict,
    weightedScore: output.judge.weighted_score,
    confidence: output.judge.confidence,
    agentConsensus: output.judge.agent_consensus,
    recommendedAction: output.judge.recommended_action,
    processingTimeMs: 12345,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    inferenceCostUsd,
    decisionValueUsd,
    valueCostRatio,
    evidenceUtilizationRate: evidence.utilizationRate,
    confidenceCalibration: calibration,
    conflict: { cv: 0.3, spread: 20, directional: true },
    error: null,
  };

  const manifest: CandidateRunManifest = {
    runId: "validate_synthetic",
    createdAt: new Date().toISOString(),
    candidate: "pipeline-with-conflict",
    model: "synthetic-validation",
    gitCommit: null,
    results: [result],
  };

  const tmpDir = join(__dirname, "runs", "__validate-tmp__");
  mkdirSync(tmpDir, { recursive: true });
  const tmpPath = join(tmpDir, "manifest.json");
  writeFileSync(tmpPath, JSON.stringify(manifest, null, 2));
  const roundTripped = JSON.parse(readFileSync(tmpPath, "utf-8")) as CandidateRunManifest;

  assert.deepEqual(roundTripped, manifest);
  assert.equal(roundTripped.results[0]?.conflict?.directional, true);
  assert.equal(roundTripped.results[0]?.valueCostRatio, valueCostRatio);

  rmSync(tmpDir, { recursive: true, force: true });
});

console.log(`\n${passed} checks passed. Harness validated with zero API cost.`);
