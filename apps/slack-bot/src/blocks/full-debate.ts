import type { KnownBlock } from "@slack/types";
import type { DecisionResponse } from "@argus/shared";

const VERDICT_LABEL: Record<DecisionResponse["verdict"], string> = {
  STRONG_YES: "STRONG YES",
  YES: "YES",
  WAIT: "WAIT",
  PASS: "PASS",
  HARD_PASS: "HARD PASS",
};

// Slack caps a section block's text at 3000 characters. The agent debate
// schema puts no max-length on the LLM-generated arrays each section below
// concatenates (data_points, criteria_evaluated, signals, risks), so a
// verbose decision could plausibly exceed that -- Slack would reject the
// whole message (`invalid_blocks`) rather than just trimming it. A safe
// margin below the real limit, not the limit itself, to leave room for the
// truncation notice.
const SLACK_SECTION_TEXT_LIMIT = 2900;

function section(text: string): KnownBlock {
  const truncated =
    text.length > SLACK_SECTION_TEXT_LIMIT
      ? `${text.slice(0, SLACK_SECTION_TEXT_LIMIT)}\n_(truncated — see the full debate in the ARGUS sidebar)_`
      : text;
  return { type: "section", text: { type: "mrkdwn", text: truncated } };
}

/**
 * Bible §6.5 "Full Debate View — Deep Inspection": the per-agent breakdown
 * (Research/ICP/Intent/Risk/Judge), rendered from the same `debate` field
 * GET /api/v1/decisions/{id} now always returns. Falls back to the flattened
 * evidence list `decision_view_more` used before this existed, for the one
 * case `debate` can still be null: a decision row that predates this field
 * (see decision.service.ts's parseDebate).
 */
export function buildFullDebateBlocks(decision: DecisionResponse): KnownBlock[] {
  const header = section(
    `*FULL DEBATE — ${decision.prospect.name}${decision.prospect.title ? `, ${decision.prospect.title}` : ""}${decision.prospect.companyName ? ` @ ${decision.prospect.companyName}` : ""}*`,
  );

  if (!decision.debate) {
    const lines = decision.evidence.map(
      (e) => `• *${e.type}* (${e.confidence}%): ${e.signal} — ${e.relevance}`,
    );
    return [header, section([`*Full evidence:*`, ...lines].join("\n"))];
  }

  const { research, icp, intent, risk, judge } = decision.debate;

  const researchLines = research.data_points
    .map((dp) => `• _${dp.type}_ ${dp.signal} — ${dp.relevance}`)
    .join("\n");

  const icpLines = icp.criteria_evaluated
    .map((c) => `• ${c.criterion} (${Math.round(c.match * 100)}% match): ${c.reasoning}`)
    .join("\n");

  const intentLines = intent.signals
    .map((s) => `• ${s.signal} — +${s.weighted_score} pts: ${s.reasoning}`)
    .join("\n");

  const riskLines = risk.risks
    .map((r) => `• *${r.severity}* ${r.category}: ${r.description}`)
    .join("\n");

  return [
    header,
    section(`*🔎 RESEARCH AGENT* (${research.confidence}% confidence)\n${research.summary}${researchLines ? `\n${researchLines}` : ""}`),
    section(`*🎯 ICP AGENT* — Score: ${icp.score}/100\n${icp.overall_assessment}${icpLines ? `\n${icpLines}` : ""}`),
    section(`*📈 INTENT AGENT* — Score: ${intent.score}/100 (${intent.trajectory})${intentLines ? `\n${intentLines}` : ""}`),
    section(`*⚠️ RISK AGENT* — Score: ${risk.score}/100 (time-waste probability: ${risk.time_waste_probability}%)${riskLines ? `\n${riskLines}` : ""}`),
    section(
      `*⚖️ JUDGE AGENT*\n*Final Verdict: ${VERDICT_LABEL[judge.verdict]} (${judge.confidence}% confidence)*\nWeighted aggregation: ICP (40%) + Intent (35%) + Risk (15%) + Research (10%) = ${judge.weighted_score}%\n${judge.reasoning}`,
    ),
  ];
}
