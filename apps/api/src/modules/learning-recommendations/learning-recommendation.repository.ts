import { prisma } from "@argus/database";
import type { LearningRecommendationStatus, LearningRecommendationSubsystem } from "@argus/shared";

export function listLearningRecommendations(teamId: string) {
  return prisma.learningRecommendation.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
  });
}

export function getLearningRecommendation(id: string, teamId: string) {
  return prisma.learningRecommendation.findFirst({ where: { id, teamId } });
}

export interface CreateLearningRecommendationInput {
  teamId: string;
  targetSubsystem: LearningRecommendationSubsystem;
  rationale: string;
  suggestedChange?: unknown;
}

export function createLearningRecommendation(input: CreateLearningRecommendationInput) {
  return prisma.learningRecommendation.create({
    data: {
      teamId: input.teamId,
      targetSubsystem: input.targetSubsystem,
      rationale: input.rationale,
      suggestedChange: (input.suggestedChange ?? null) as never,
    },
  });
}

/** updateMany (not update) so teamId is enforced at the DB level too, not
 *  just by the service layer's own ownership check before calling this --
 *  defense in depth against a cross-team id guess. */
export async function resolveLearningRecommendation(
  id: string,
  teamId: string,
  status: Exclude<LearningRecommendationStatus, "PENDING">,
  reviewedBy: string,
) {
  await prisma.learningRecommendation.updateMany({
    where: { id, teamId },
    data: { status, reviewedAt: new Date(), reviewedBy },
  });
  return getLearningRecommendation(id, teamId);
}
