/**
 * v4 roadmap Phase 9 -- extended metrics for the 3-candidate architecture
 * benchmark, beyond what Phase 0's basic manifest already captures
 * (verdict/score/confidence/latency).
 *
 * Two of these are explicitly proxy metrics, not the metric they're named
 * after -- documented here so the eventual report doesn't overstate what
 * was actually measured:
 *
 * - Evidence utilization: there's no real "did it pick the right evidence"
 *   to measure (no candidate consumes the Retriever Registry or Evidence
 *   Graph yet, both still unwired). This instead checks what fraction of
 *   distinct input signals get referenced anywhere in the debate output's
 *   text -- a text-matching heuristic, approximate by nature.
 * - Confidence calibration: true calibration needs real outcome ground
 *   truth, which synthetic fixtures don't have. This instead checks one
 *   directly-stated Bible rule as a coherence proxy: Judge §8.7's own
 *   constraint "if data is sparse, confidence should be <70 regardless of
 *   score."
 */
import type { AgentDebateOutput } from "@argus/shared";
import { calculateDecisionValue, calculateInferenceCostUsd, calculateValueCostRatio } from "../src/agents/decision-value.service.js";
import type { DecisionAgentInput } from "../src/agents/orchestrator.js";

export function computeInferenceCost(usage: { inputTokens: number; outputTokens: number }) {
  return calculateInferenceCostUsd(usage.inputTokens, usage.outputTokens);
}

/** Decision Value per Dollar, no-outcome variant (outcomeType: null) --
 *  only time_saved contributes; revenue/false-positive/false-negative all
 *  require a real outcome fixtures don't have. Reported as a partial
 *  proxy, not the full metric. */
export function computeDecisionValuePerDollar(verdict: AgentDebateOutput["judge"]["verdict"], inferenceCostUsd: number) {
  const { decisionValueUsd } = calculateDecisionValue({ verdict, outcomeType: null });
  return { decisionValueUsd, valueCostRatio: calculateValueCostRatio(decisionValueUsd, inferenceCostUsd) };
}

function extractInputSignals(input: DecisionAgentInput): string[] {
  const signals: string[] = [];
  const prospectData = input.prospectData as {
    company?: { industry?: string | null; funding?: string | null };
    rawProfile?: { recentActivity?: string[] } | null;
    enrichedData?: { riskSignal?: string | null } | null;
  } | null;

  if (prospectData?.company?.industry) signals.push(prospectData.company.industry);
  if (prospectData?.company?.funding) signals.push(prospectData.company.funding);
  if (prospectData?.rawProfile?.recentActivity) signals.push(...prospectData.rawProfile.recentActivity);
  if (prospectData?.enrichedData?.riskSignal) signals.push(prospectData.enrichedData.riskSignal);

  return signals.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

function debateOutputText(output: AgentDebateOutput): string {
  return [
    output.research.summary,
    ...output.research.data_points.map((d) => `${d.signal} ${d.relevance}`),
    output.icp.overall_assessment,
    ...output.risk.risks.map((r) => `${r.description} ${r.evidence}`),
    output.judge.reasoning,
    ...output.judge.key_evidence,
  ]
    .join(" ")
    .toLowerCase();
}

/** % of distinct input signals (company industry/funding, recentActivity
 *  entries, risk signal) that appear (case-insensitive substring match)
 *  somewhere in the debate's own reasoning/evidence text. See module
 *  comment for why this is a proxy, not a rigorous measure. */
export function computeEvidenceUtilization(
  input: DecisionAgentInput,
  output: AgentDebateOutput,
): { referencedCount: number; totalSignals: number; utilizationRate: number | null } {
  const signals = extractInputSignals(input);
  if (signals.length === 0) return { referencedCount: 0, totalSignals: 0, utilizationRate: null };

  const text = debateOutputText(output);
  // A short, distinctive fragment of each signal (first 4 words) rather
  // than the whole sentence, since the model paraphrases rather than
  // quoting verbatim.
  const referencedCount = signals.filter((signal) => {
    const fragment = signal.split(/\s+/).slice(0, 4).join(" ").toLowerCase();
    return fragment.length > 0 && text.includes(fragment);
  }).length;

  return { referencedCount, totalSignals: signals.length, utilizationRate: referencedCount / signals.length };
}

const SPARSE_RESEARCH_CONFIDENCE_THRESHOLD = 50;
const SPARSE_DATA_GAPS_THRESHOLD = 3;
const SPARSE_DATA_CONFIDENCE_CEILING = 70;

/** Bible §8.7's own constraint: "if data is sparse, confidence should be
 *  <70 regardless of score." "Sparse" here is proxied as low Research
 *  confidence or 3+ stated data gaps -- both are Research's own explicit
 *  signals about its own input quality, not a guess layered on top. */
export function computeConfidenceCalibrationFlag(output: AgentDebateOutput): {
  consideredSparse: boolean;
  judgeConfidence: number;
  ruleHeld: boolean;
} {
  const consideredSparse =
    output.research.confidence < SPARSE_RESEARCH_CONFIDENCE_THRESHOLD ||
    output.research.data_gaps.length >= SPARSE_DATA_GAPS_THRESHOLD;

  const ruleHeld = !consideredSparse || output.judge.confidence < SPARSE_DATA_CONFIDENCE_CEILING;

  return { consideredSparse, judgeConfidence: output.judge.confidence, ruleHeld };
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))] as number;
}
