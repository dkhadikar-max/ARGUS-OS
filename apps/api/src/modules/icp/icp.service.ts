import { AppError, icpWeightsAreValid, type IcpResponse, type UpdateIcpRequest } from "@argus/shared";
import type { OutcomeType, Verdict } from "@argus/database";
import { ADMIN_ROLES, type AuthContext } from "../../middleware/auth.js";
import { recordAudit, type RequestMeta } from "../../lib/audit.js";
import { appendIcpHistoryEntry, getDecisionsSince, getIcp, upsertIcp } from "./icp.repository.js";

// Same "the AI said yes, did it convert to a meeting" definition
// outcome.service.ts's team-wide accuracy.score already uses (Bible §18
// DSH-3) -- ICP accuracy asks the same underlying question ("is our
// targeting working"), just scoped to one ICP version's own active window
// instead of a team's whole history. A separate implementation, not a
// shared call, since outcome.service.ts pre-aggregates into per-verdict
// buckets before scoring; this works directly from a flat decision list.
const MEETING_OUTCOME_TYPES = new Set<OutcomeType>(["MEETING_BOOKED", "OPPORTUNITY_CREATED", "CLOSED_WON"]);
const POSITIVE_PREDICTION_VERDICTS = new Set<Verdict>(["STRONG_YES", "YES"]);

// Same floor memory.service.ts's patterns/riskFlags/topPerformingMessages
// already enforce (MIN_SAMPLE_SIZE = 3 there too) -- without it, a version
// that converted its one and only scored decision reads as an unqualified
// "100% accurate," indistinguishable from a version backed by 150 decisions.
const MIN_SAMPLE_SIZE = 3;

export function computeVersionAccuracy(
  decisions: Array<{ verdict: Verdict; outcome: { type: OutcomeType } | null }>,
): { accuracy: number; sampleSize: number } | null {
  const positivePredictions = decisions.filter(
    (d): d is { verdict: Verdict; outcome: { type: OutcomeType } } =>
      POSITIVE_PREDICTION_VERDICTS.has(d.verdict) && d.outcome !== null,
  );
  // Null (not a fabricated 0, and not a misleadingly definitive-looking
  // 100%/0% from a single sample) below MIN_SAMPLE_SIZE -- an honestly
  // un-scoreable-yet version, same reasoning the team-wide accuracy.score
  // uses for its own null case.
  if (positivePredictions.length < MIN_SAMPLE_SIZE) return null;
  const meetings = positivePredictions.filter((d) => MEETING_OUTCOME_TYPES.has(d.outcome.type)).length;
  return { accuracy: meetings / positivePredictions.length, sampleSize: positivePredictions.length };
}

// Criteria weights should sum to ~1 (Bible §5.2/§9.1's ICPDefinition.criteria
// shape) -- enforced here, not at the Zod schema level, since a manager
// mid-edit of the form has a transient state with duplicate/partial weights
// that's still valid to *hold in the UI*, just not to *save*. An empty
// criteria array (clearing the ICP) is exempt: there's nothing to sum.
// icpWeightsAreValid/the tolerance itself live in packages/shared so the
// dashboard's IcpCriteriaEditor can disable Save client-side using the
// exact same check this throws on, instead of a second copy that could
// silently drift out of sync with this one.
function assertWeightsSumToOne(criteria: UpdateIcpRequest["criteria"]): void {
  if (icpWeightsAreValid(criteria)) return;
  const sum = criteria.reduce((total, c) => total + c.weight, 0);
  throw new AppError("VALIDATION_ERROR", `Criteria weights must sum to 1 (currently ${sum.toFixed(2)})`);
}

export async function getIcpForTeam(auth: AuthContext): Promise<IcpResponse> {
  const icp = await getIcp(auth.teamId);
  if (!icp) {
    return { teamId: auth.teamId, criteria: [], version: 0, updatedAt: null };
  }
  return {
    teamId: auth.teamId,
    criteria: icp.criteria as never,
    version: icp.version,
    updatedAt: icp.updatedAt.toISOString(),
  };
}

export async function updateIcpForTeam(
  auth: AuthContext,
  request: UpdateIcpRequest,
  meta?: RequestMeta,
): Promise<IcpResponse> {
  if (!auth.role || !ADMIN_ROLES.has(auth.role)) {
    throw new AppError("FORBIDDEN", "Only a team admin can edit the ICP definition");
  }
  assertWeightsSumToOne(request.criteria);

  // Captured before the upsert below overwrites it -- this is the version
  // about to be retired. `null` on a team's very first-ever ICP save (no
  // prior version to snapshot).
  const outgoing = await getIcp(auth.teamId);

  const updated = await upsertIcp(auth.teamId, request.criteria);

  if (outgoing) {
    // Bible §10.5 `icpAccuracy`/`CompanyMemory.icpHistory` -- this is the
    // one write that starts tracking ICP version history at all
    // (`icpHistory` existed as a schema column with nothing ever writing
    // to it before this). `outgoing.updatedAt` is exactly when this
    // version itself became active (Prisma sets updatedAt = createdAt on
    // the row's own creation, so this works whether outgoing is version 1
    // or a later one).
    const decisionsDuringOutgoingVersion = await getDecisionsSince(auth.teamId, outgoing.updatedAt);
    const outgoingAccuracy = computeVersionAccuracy(decisionsDuringOutgoingVersion);
    await appendIcpHistoryEntry(auth.teamId, {
      version: outgoing.version,
      criteria: outgoing.criteria,
      accuracy: outgoingAccuracy?.accuracy ?? null,
      sampleSize: outgoingAccuracy?.sampleSize ?? 0,
      activatedAt: outgoing.updatedAt.toISOString(),
      replacedAt: new Date().toISOString(),
    });
  }

  await recordAudit({
    entityType: "icp",
    entityId: auth.teamId,
    action: "updated",
    actorId: auth.userId ?? "system",
    afterState: { version: updated.version, criteriaCount: request.criteria.length },
    meta,
  });

  return {
    teamId: auth.teamId,
    criteria: updated.criteria as never,
    version: updated.version,
    updatedAt: updated.updatedAt.toISOString(),
  };
}
