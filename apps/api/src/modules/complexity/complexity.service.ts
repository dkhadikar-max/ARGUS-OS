import {
  AppError,
  type DecisionComplexityWeightState,
  type DecisionComplexityWeightVersionEntry,
  type DecisionComplexityWeights,
  type RecomputeDecisionComplexityWeightsResponse,
} from "@argus/shared";
import { ADMIN_ROLES, type AuthContext } from "../../middleware/auth.js";
import { recordAudit, type RequestMeta } from "../../lib/audit.js";
import { getLabeledDecisionsForTeam } from "../../agents/complexity/complexity-training-data.repository.js";
import { computeWeightsFromLabeledDecisions } from "../../agents/complexity/decision-complexity.js";
import {
  approveComplexityWeights,
  createPendingComplexityWeights,
  getActiveComplexityWeights,
  getComplexityWeightsByVersion,
  getPendingComplexityWeights,
  rejectComplexityWeights,
} from "./complexity.repository.js";

interface ComplexityWeightsRow {
  version: number;
  weights: unknown;
  sampleSize: number;
  status: "ACTIVE" | "PENDING" | "REJECTED" | "SUPERSEDED";
  createdAt: Date;
  createdBy: string;
  approvedAt: Date | null;
  approvedBy: string | null;
}

function toEntry(row: ComplexityWeightsRow): DecisionComplexityWeightVersionEntry {
  return {
    version: row.version,
    weights: row.weights as DecisionComplexityWeights,
    sampleSize: row.sampleSize,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedBy: row.approvedBy,
  };
}

function requireAdmin(auth: AuthContext, action: string): void {
  if (!auth.role || !ADMIN_ROLES.has(auth.role)) {
    throw new AppError("FORBIDDEN", `Only a team admin can ${action}`);
  }
}

/** Returns the team's current ACTIVE weights plus the currently-pending
 *  proposal, if any -- same "A/B support" surface as
 *  getRoutingThresholdStateForTeam. */
export async function getComplexityWeightStateForTeam(auth: AuthContext): Promise<DecisionComplexityWeightState> {
  requireAdmin(auth, "view decision complexity weights");

  const [active, pending] = await Promise.all([
    getActiveComplexityWeights(auth.teamId),
    getPendingComplexityWeights(auth.teamId),
  ]);

  return {
    teamId: auth.teamId,
    active: active ? toEntry(active) : null,
    pending: pending ? toEntry(pending) : null,
  };
}

/** The only way a DecisionComplexityWeights row is ever created -- there is
 *  deliberately no "propose arbitrary weights" endpoint (contrast with
 *  proposeRoutingThresholdsForTeam). Pulls every decision with a logged
 *  outcome, classifies each as correct/wrong/ambiguous, and only proposes
 *  new weights when there's enough real signal to trust -- see
 *  computeWeightsFromLabeledDecisions for the exact thresholds. */
export async function recomputeComplexityWeightsForTeam(
  auth: AuthContext,
  meta?: RequestMeta,
): Promise<RecomputeDecisionComplexityWeightsResponse> {
  requireAdmin(auth, "recompute decision complexity weights");

  const labeled = await getLabeledDecisionsForTeam(auth.teamId);
  const result = computeWeightsFromLabeledDecisions(labeled);

  if (result.status === "insufficient_data") {
    return {
      status: "insufficient_data",
      reason: result.reason ?? "not_enough_labeled_decisions",
      labeledDecisionCount: result.labeledDecisionCount,
      correctCount: result.correctCount,
      wrongCount: result.wrongCount,
    };
  }

  // result.status === "proposed" always carries `weights` here --
  // computeWeightsFromLabeledDecisions only omits it on insufficient_data.
  const weights = result.weights as DecisionComplexityWeights;
  const created = await createPendingComplexityWeights(
    auth.teamId,
    weights,
    result.labeledDecisionCount,
    auth.userId ?? "system",
  );

  await recordAudit({
    entityType: "decision_complexity_weights",
    entityId: auth.teamId,
    action: "recomputed",
    actorId: auth.userId ?? "system",
    afterState: { version: created.version, weights, sampleSize: result.labeledDecisionCount },
    meta,
  });

  return { status: "proposed", entry: toEntry(created) };
}

export async function approveComplexityWeightsForTeam(
  auth: AuthContext,
  version: number,
  meta?: RequestMeta,
): Promise<DecisionComplexityWeightVersionEntry> {
  requireAdmin(auth, "approve decision complexity weights");

  const target = await getComplexityWeightsByVersion(auth.teamId, version);
  if (!target || target.status !== "PENDING") {
    throw new AppError("NOT_FOUND", `No pending decision complexity weights version ${version} for this team`);
  }

  const approved = await approveComplexityWeights(auth.teamId, version, auth.userId ?? "system");

  await recordAudit({
    entityType: "decision_complexity_weights",
    entityId: auth.teamId,
    action: "approved",
    actorId: auth.userId ?? "system",
    afterState: { version },
    meta,
  });

  return toEntry(approved);
}

export async function rejectComplexityWeightsForTeam(
  auth: AuthContext,
  version: number,
  meta?: RequestMeta,
): Promise<DecisionComplexityWeightVersionEntry> {
  requireAdmin(auth, "reject decision complexity weights");

  const target = await getComplexityWeightsByVersion(auth.teamId, version);
  if (!target || target.status !== "PENDING") {
    throw new AppError("NOT_FOUND", `No pending decision complexity weights version ${version} for this team`);
  }

  const rejected = await rejectComplexityWeights(auth.teamId, version, auth.userId ?? "system");

  await recordAudit({
    entityType: "decision_complexity_weights",
    entityId: auth.teamId,
    action: "rejected",
    actorId: auth.userId ?? "system",
    afterState: { version },
    meta,
  });

  return toEntry(rejected);
}
