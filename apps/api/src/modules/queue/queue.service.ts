import type { QueueResponse } from "@argus/shared";
import type { Verdict } from "@argus/database";
import { countPriorDecisionsByProspect, getActiveDecisionsForUser } from "./queue.repository.js";

// Bible §18 BCK-5 "Priority scoring algorithm". Combines verdict strength,
// AI confidence, and recency into a single rank so the highest-value,
// freshest prospects surface at the top of Today's Queue (§6.2).
const VERDICT_WEIGHT: Record<Verdict, number> = {
  STRONG_YES: 20,
  YES: 10,
  WAIT: 0,
  PASS: -15,
  HARD_PASS: -30,
};

const RECENCY_HALF_LIFE_HOURS = 48;

function recencyBonus(createdAt: Date): number {
  const hoursSince = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  return 10 * Math.pow(0.5, hoursSince / RECENCY_HALF_LIFE_HOURS);
}

function suggestedActionLabel(recommendedAction: string | null): string {
  switch (recommendedAction) {
    case "message_now":
      return "Send LinkedIn message";
    case "research_more":
      return "Research more";
    case "wait_for_signal":
      return "Wait for signal";
    case "pass_and_move_on":
      return "Pass and move on";
    default:
      return "Review decision";
  }
}

function lastActivityLabel(createdAt: Date, isReEngagement: boolean): string {
  const hoursSince = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  if (isReEngagement) return "Re-engagement";
  if (hoursSince < 24) return "New since yesterday";
  if (hoursSince < 24 * 7) return "New this week";
  return `${Math.floor(hoursSince / 24)} days ago`;
}

export async function getQueueForUser(userId: string, teamId: string): Promise<QueueResponse> {
  const decisions = await getActiveDecisionsForUser(userId, teamId);

  const priorCounts = await countPriorDecisionsByProspect(
    decisions.map((d) => d.prospectId),
    teamId,
  );
  const priorCountByProspect = new Map(priorCounts.map((p) => [p.prospectId, p._count._all]));

  const ranked = decisions
    .map((decision) => {
      const priorCount = priorCountByProspect.get(decision.prospectId) ?? 1;
      const isReEngagement = priorCount > 1;
      const priorityScore =
        decision.confidence + VERDICT_WEIGHT[decision.verdict] + recencyBonus(decision.createdAt);

      return {
        decision,
        isReEngagement,
        priorityScore,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const items: QueueResponse["items"] = ranked.map(({ decision, isReEngagement, priorityScore }, index) => ({
    rank: index + 1,
    decisionId: decision.id,
    prospect: {
      name: decision.prospect.name,
      title: decision.prospect.title,
      companyName: decision.prospect.companyName,
      linkedInUrl: decision.prospect.linkedInUrl,
    },
    verdict: decision.verdict,
    confidence: decision.confidence,
    priorityScore: Math.round(priorityScore * 10) / 10,
    reason: decision.reasoning.split(". ").slice(0, 1).join(". "),
    lastActivity: lastActivityLabel(decision.createdAt, isReEngagement),
    suggestedAction: suggestedActionLabel(decision.recommendedAction),
    messagePreview: decision.messageDrafts[0]?.body.slice(0, 120) ?? null,
    createdAt: decision.createdAt.toISOString(),
  }));

  const stats = {
    total: items.length,
    strongYes: items.filter((i) => i.verdict === "STRONG_YES").length,
    yes: items.filter((i) => i.verdict === "YES").length,
    wait: items.filter((i) => i.verdict === "WAIT").length,
    pass: items.filter((i) => i.verdict === "PASS" || i.verdict === "HARD_PASS").length,
    newSinceYesterday: items.filter((i) => i.lastActivity === "New since yesterday").length,
    reEngagements: items.filter((i) => i.lastActivity === "Re-engagement").length,
  };

  return {
    userId,
    generatedAt: new Date().toISOString(),
    items,
    stats,
  };
}
