import { AppError, type CreateOutcomeRequest, type CreateOutcomeResponse, type ListOutcomesQuery, type ListOutcomesResponse, type Verdict } from "@argus/shared";
import type { AuthContext } from "../../middleware/auth.js";
import {
  countDecisionsForTeam,
  createOutcomeRecord,
  findDecisionForOutcome,
  getDecisionsForRepBreakdown,
  getTeamOutcomesForVerdict,
  getVerdictAggregations,
  listOutcomes,
  upsertCompanyMemoryPatternForVerdict,
} from "./outcome.repository.js";
import { publishTeamEvent } from "../../lib/pubsub.js";
import { invalidateDecisionCache } from "../../lib/decision-cache.js";
import { track } from "../../lib/analytics.js";
import { recordAudit, type RequestMeta } from "../../lib/audit.js";

const MEETING_OUTCOME_TYPES = new Set(["MEETING_BOOKED", "OPPORTUNITY_CREATED", "CLOSED_WON"]);

// Bible Appendix F's own tiers for "how much has this team taught ARGUS
// yet" -- reused here for §18 DSH-3's "Accuracy score display" verbatim,
// even though the confidence-multiplier mechanism they originally describe
// (rawConfidence * 0.7/0.85/1.0) isn't itself implemented.
const CALIBRATING_THRESHOLD = 50;
const MATURE_THRESHOLD = 200;

function calibrationMode(totalDecisions: number): "learning" | "calibrating" | "mature" {
  if (totalDecisions < CALIBRATING_THRESHOLD) return "learning";
  if (totalDecisions <= MATURE_THRESHOLD) return "calibrating";
  return "mature";
}

// Bible §4.4 Manager Morgan: "Decision accuracy score per rep" -- same
// weighted STRONG_YES/YES meeting-rate proxy as the team-wide
// `accuracy.score` above, just grouped by the rep who generated each
// decision instead of collapsed across the whole team.
function computeRepBreakdown(
  decisions: Awaited<ReturnType<typeof getDecisionsForRepBreakdown>>,
): ListOutcomesResponse["accuracy"]["byRep"] {
  const byRep = new Map<
    string,
    { name: string; totalDecisions: number; positivePredictions: number; meetings: number }
  >();

  for (const d of decisions) {
    const bucket = byRep.get(d.userId) ?? {
      name: d.user.name ?? d.user.email,
      totalDecisions: 0,
      positivePredictions: 0,
      meetings: 0,
    };
    bucket.totalDecisions += 1;
    if ((d.verdict === "STRONG_YES" || d.verdict === "YES") && d.outcome) {
      bucket.positivePredictions += 1;
      if (MEETING_OUTCOME_TYPES.has(d.outcome.type)) bucket.meetings += 1;
    }
    byRep.set(d.userId, bucket);
  }

  return Array.from(byRep.entries()).map(([userId, bucket]) => ({
    userId,
    name: bucket.name,
    totalDecisions: bucket.totalDecisions,
    score: bucket.positivePredictions > 0 ? bucket.meetings / bucket.positivePredictions : null,
  }));
}

/**
 * Lightweight synchronous learning update (Bible §5.3 Learning Layer,
 * §8.8 Learning Agent). The full background Learning Agent (prompt-tuning,
 * ICP refinement) is a Phase 2 P1 roadmap item (§15.1 "Learning loop v2");
 * this recomputes the Company Memory pattern for the affected verdict
 * segment immediately so Today Queue / Company Memory reflect it right away.
 */
async function updateCompanyMemoryPattern(
  teamId: string,
  verdict: Verdict,
): Promise<string> {
  const outcomes = await getTeamOutcomesForVerdict(teamId, verdict);
  const meetings = outcomes.filter((o) => MEETING_OUTCOME_TYPES.has(o.type)).length;
  const meetingRate = outcomes.length > 0 ? meetings / outcomes.length : 0;
  const patternDescription = `${verdict} decisions convert to meetings at ${Math.round(meetingRate * 100)}% (n=${outcomes.length})`;

  await upsertCompanyMemoryPatternForVerdict(teamId, verdict, {
    verdict,
    description: patternDescription,
    sampleSize: outcomes.length,
    meetingRate,
    updatedAt: new Date().toISOString(),
  });

  return patternDescription;
}

export async function createOutcome(
  request: CreateOutcomeRequest,
  auth: AuthContext,
  meta?: RequestMeta,
): Promise<CreateOutcomeResponse> {
  if (!auth.userId) {
    throw new AppError("FORBIDDEN", "Only authenticated users can log outcomes");
  }

  const decision = await findDecisionForOutcome(request.decisionId, auth.teamId);
  if (!decision) {
    throw new AppError("NOT_FOUND", "Decision not found");
  }
  if (decision.outcome) {
    throw new AppError("DECISION_STALE", "Outcome already logged for this decision");
  }

  const outcome = await createOutcomeRecord({
    decisionId: request.decisionId,
    userId: auth.userId,
    type: request.type,
    value: request.value,
    timeToOutcomeDays: request.timeToOutcomeDays,
    feedback: request.feedback,
  });

  const patternUpdated = await updateCompanyMemoryPattern(auth.teamId, decision.verdict);

  // Bible §18 AI-5 "Cache invalidation rules": this outcome is new ground
  // truth for `historicalEngagement` on this prospect (§8.5's Intent Agent
  // input) — any cached debate output for them is now stale regardless of
  // its 24h TTL.
  await invalidateDecisionCache(decision.prospectId, auth.teamId);

  await publishTeamEvent(auth.teamId, {
    type: "outcome.logged",
    data: {
      decisionId: outcome.decisionId,
      teamId: auth.teamId,
      userId: auth.userId,
      outcomeType: outcome.type,
      timestamp: outcome.loggedAt.toISOString(),
    },
  });

  track(auth.userId, {
    name: "outcome_logged",
    properties: {
      decision_id: outcome.decisionId,
      outcome_type: outcome.type,
      time_to_outcome_days: outcome.timeToOutcomeDays,
      feedback_provided: Boolean(outcome.feedback),
    },
  });

  // Bible §19.1 Data Integrity: "Audit logs capture all state changes".
  await recordAudit({
    entityType: "outcome",
    entityId: outcome.id,
    action: "created",
    actorId: auth.userId,
    afterState: {
      decisionId: outcome.decisionId,
      type: outcome.type,
      timeToOutcomeDays: outcome.timeToOutcomeDays,
    },
    meta,
  });

  return {
    id: outcome.id,
    decisionId: outcome.decisionId,
    type: outcome.type,
    value: outcome.value,
    timeToOutcomeDays: outcome.timeToOutcomeDays,
    feedback: outcome.feedback,
    loggedAt: outcome.loggedAt.toISOString(),
    learningApplied: true,
    patternUpdated,
  };
}

export async function listOutcomesForTeam(
  query: ListOutcomesQuery,
): Promise<ListOutcomesResponse> {
  const [{ rows, total }, aggregationRows, totalDecisions, repDecisions] = await Promise.all([
    listOutcomes(query),
    getVerdictAggregations(query.teamId),
    countDecisionsForTeam(query.teamId),
    getDecisionsForRepBreakdown(query.teamId),
  ]);

  const byVerdict: ListOutcomesResponse["aggregations"]["byVerdict"] = {};
  const grouped = new Map<Verdict, { count: number; meetings: number; totalDays: number; daysCount: number }>();

  for (const row of aggregationRows) {
    const verdict = row.decision.verdict;
    const bucket = grouped.get(verdict) ?? { count: 0, meetings: 0, totalDays: 0, daysCount: 0 };
    bucket.count += 1;
    if (MEETING_OUTCOME_TYPES.has(row.type)) bucket.meetings += 1;
    if (row.timeToOutcomeDays != null) {
      bucket.totalDays += row.timeToOutcomeDays;
      bucket.daysCount += 1;
    }
    grouped.set(verdict, bucket);
  }

  for (const [verdict, bucket] of grouped) {
    byVerdict[verdict] = {
      count: bucket.count,
      meetingRate: bucket.count > 0 ? bucket.meetings / bucket.count : 0,
      avgTimeToMeeting: bucket.daysCount > 0 ? bucket.totalDays / bucket.daysCount : null,
    };
  }

  // "Accuracy" proxy: the AI's positive predictions (STRONG_YES/YES) should
  // convert to a meeting — weighted by each bucket's own sample size so a
  // handful of STRONG_YES outcomes doesn't get the same say as a hundred
  // YES ones. Null (not 0) when neither bucket has a logged outcome yet:
  // an honest "not enough data", not a fabricated zero.
  const strongYes = byVerdict.STRONG_YES;
  const yes = byVerdict.YES;
  const positivePredictionCount = (strongYes?.count ?? 0) + (yes?.count ?? 0);
  const positivePredictionMeetings =
    (strongYes ? strongYes.meetingRate * strongYes.count : 0) + (yes ? yes.meetingRate * yes.count : 0);

  return {
    data: rows.map((row) => ({
      id: row.id,
      decisionId: row.decisionId,
      type: row.type,
      verdict: row.decision.verdict,
      confidence: row.decision.confidence,
      prospectName: row.decision.prospect.name,
      prospectTitle: row.decision.prospect.title,
      companyName: row.decision.prospect.companyName,
      timeToOutcomeDays: row.timeToOutcomeDays,
      loggedAt: row.loggedAt.toISOString(),
    })),
    pagination: {
      total,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + rows.length < total,
    },
    aggregations: { byVerdict },
    accuracy: {
      totalDecisions,
      mode: calibrationMode(totalDecisions),
      score: positivePredictionCount > 0 ? positivePredictionMeetings / positivePredictionCount : null,
      byRep: computeRepBreakdown(repDecisions),
    },
  };
}
