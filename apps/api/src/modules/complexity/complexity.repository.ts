import { prisma } from "@argus/database";
import type { DecisionComplexityWeights } from "@argus/shared";

export function getActiveComplexityWeights(teamId: string) {
  return prisma.decisionComplexityWeights.findFirst({ where: { teamId, status: "ACTIVE" } });
}

export function getPendingComplexityWeights(teamId: string) {
  return prisma.decisionComplexityWeights.findFirst({
    where: { teamId, status: "PENDING" },
    orderBy: { version: "desc" },
  });
}

export function getComplexityWeightsByVersion(teamId: string, version: number) {
  return prisma.decisionComplexityWeights.findUnique({ where: { teamId_version: { teamId, version } } });
}

async function nextVersionNumber(teamId: string): Promise<number> {
  const latest = await prisma.decisionComplexityWeights.findFirst({
    where: { teamId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

/** A team may only have one PENDING proposal at a time -- a new recompute
 *  supersedes whatever was previously PENDING (if anything), same
 *  "avoids an unbounded pile of never-resolved proposals" reasoning as
 *  createPendingRoutingThresholdVersion. */
export async function createPendingComplexityWeights(
  teamId: string,
  weights: DecisionComplexityWeights,
  sampleSize: number,
  createdBy: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.decisionComplexityWeights.updateMany({
      where: { teamId, status: "PENDING" },
      data: { status: "SUPERSEDED" },
    });
    const version = await nextVersionNumber(teamId);
    return tx.decisionComplexityWeights.create({
      data: { teamId, version, weights: weights as never, sampleSize, status: "PENDING", createdBy },
    });
  });
}

/** Approving a PENDING version atomically supersedes whichever version was
 *  ACTIVE before it -- only one ACTIVE row per team at a time. */
export async function approveComplexityWeights(teamId: string, version: number, approvedBy: string) {
  return prisma.$transaction(async (tx) => {
    await tx.decisionComplexityWeights.updateMany({
      where: { teamId, status: "ACTIVE" },
      data: { status: "SUPERSEDED" },
    });
    return tx.decisionComplexityWeights.update({
      where: { teamId_version: { teamId, version } },
      data: { status: "ACTIVE", approvedAt: new Date(), approvedBy },
    });
  });
}

/** approvedBy/approvedAt double as "who resolved this proposal, and when"
 *  for both approve and reject, same as rejectRoutingThresholdVersion. */
export function rejectComplexityWeights(teamId: string, version: number, rejectedBy: string) {
  return prisma.decisionComplexityWeights.update({
    where: { teamId_version: { teamId, version } },
    data: { status: "REJECTED", approvedAt: new Date(), approvedBy: rejectedBy },
  });
}
