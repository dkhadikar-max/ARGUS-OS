import {
  AppError,
  type ListLearningRecommendationsResponse,
  type LearningRecommendation as LearningRecommendationDto,
  type ResolveLearningRecommendationRequest,
} from "@argus/shared";
import { ADMIN_ROLES, type AuthContext } from "../../middleware/auth.js";
import { recordAudit, type RequestMeta } from "../../lib/audit.js";
import {
  getLearningRecommendation,
  listLearningRecommendations,
  resolveLearningRecommendation,
} from "./learning-recommendation.repository.js";

interface LearningRecommendationRow {
  id: string;
  targetSubsystem: LearningRecommendationDto["targetSubsystem"];
  rationale: string;
  suggestedChange: unknown;
  status: LearningRecommendationDto["status"];
  createdAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
}

function toDto(row: LearningRecommendationRow): LearningRecommendationDto {
  return {
    id: row.id,
    targetSubsystem: row.targetSubsystem,
    rationale: row.rationale,
    suggestedChange: row.suggestedChange,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedBy: row.reviewedBy,
  };
}

function requireAdmin(auth: AuthContext, action: string): void {
  if (!auth.role || !ADMIN_ROLES.has(auth.role)) {
    throw new AppError("FORBIDDEN", `Only a team admin can ${action}`);
  }
}

export async function listLearningRecommendationsForTeam(
  auth: AuthContext,
): Promise<ListLearningRecommendationsResponse> {
  requireAdmin(auth, "view Learning Agent recommendations");

  const rows = await listLearningRecommendations(auth.teamId);
  return { teamId: auth.teamId, recommendations: rows.map(toDto) };
}

/** "Resolving" a recommendation (ACTIONED or DISMISSED) only records that a
 *  human reviewed it and what they did about it -- it never itself edits
 *  the ICP, prompts, or anything else. The actual change (if any) happens
 *  through that subsystem's own existing path (the ICP editor, a manual
 *  prompts.ts edit, etc.), same as Decision 3's "Learning should propose.
 *  Humans merge." */
export async function resolveLearningRecommendationForTeam(
  auth: AuthContext,
  id: string,
  request: ResolveLearningRecommendationRequest,
  meta?: RequestMeta,
): Promise<LearningRecommendationDto> {
  requireAdmin(auth, "resolve Learning Agent recommendations");

  const existing = await getLearningRecommendation(id, auth.teamId);
  if (!existing) {
    throw new AppError("NOT_FOUND", "Learning recommendation not found");
  }

  const resolved = await resolveLearningRecommendation(id, auth.teamId, request.status, auth.userId ?? "system");
  if (!resolved) {
    throw new AppError("NOT_FOUND", "Learning recommendation not found");
  }

  await recordAudit({
    entityType: "learning_recommendation",
    entityId: id,
    action: request.status.toLowerCase(),
    actorId: auth.userId ?? "system",
    afterState: { targetSubsystem: existing.targetSubsystem, status: request.status },
    meta,
  });

  return toDto(resolved);
}
