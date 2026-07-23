import { prisma } from "@argus/database";
import type { RoutingThresholds } from "@argus/shared";

export function getActiveRoutingThresholdVersion(teamId: string) {
  return prisma.routingThresholdVersion.findFirst({ where: { teamId, status: "ACTIVE" } });
}

export function getPendingRoutingThresholdVersion(teamId: string) {
  return prisma.routingThresholdVersion.findFirst({
    where: { teamId, status: "PENDING" },
    orderBy: { version: "desc" },
  });
}

export function getRoutingThresholdVersionHistory(teamId: string) {
  return prisma.routingThresholdVersion.findMany({ where: { teamId }, orderBy: { version: "desc" } });
}

export function getRoutingThresholdVersionByNumber(teamId: string, version: number) {
  return prisma.routingThresholdVersion.findUnique({ where: { teamId_version: { teamId, version } } });
}

async function nextVersionNumber(teamId: string): Promise<number> {
  const latest = await prisma.routingThresholdVersion.findFirst({
    where: { teamId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

/** A team may only have one PENDING proposal at a time -- creating a new
 *  one doesn't affect the ACTIVE version, only replaces whatever was
 *  previously PENDING (if anything), avoiding an unbounded pile of
 *  never-resolved proposals. */
export async function createPendingRoutingThresholdVersion(
  teamId: string,
  thresholds: RoutingThresholds,
  createdBy: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.routingThresholdVersion.updateMany({
      where: { teamId, status: "PENDING" },
      data: { status: "SUPERSEDED" },
    });
    const version = await nextVersionNumber(teamId);
    return tx.routingThresholdVersion.create({
      data: { teamId, version, thresholds: thresholds as never, status: "PENDING", createdBy },
    });
  });
}

/** Approving a PENDING version atomically supersedes whichever version was
 *  ACTIVE before it -- only one ACTIVE row per team at a time. */
export async function approveRoutingThresholdVersion(teamId: string, version: number, approvedBy: string) {
  return prisma.$transaction(async (tx) => {
    await tx.routingThresholdVersion.updateMany({
      where: { teamId, status: "ACTIVE" },
      data: { status: "SUPERSEDED" },
    });
    return tx.routingThresholdVersion.update({
      where: { teamId_version: { teamId, version } },
      data: { status: "ACTIVE", approvedAt: new Date(), approvedBy },
    });
  });
}

/** approvedBy/approvedAt double as "who resolved this proposal, and when"
 *  for both approve and reject -- a REJECTED row's approvedBy is the
 *  rejecting admin, not a claim that it was approved. Documented here
 *  rather than adding a second pair of fields for a V1 that only needs one
 *  terminal-resolution timestamp either way. */
export function rejectRoutingThresholdVersion(teamId: string, version: number, rejectedBy: string) {
  return prisma.routingThresholdVersion.update({
    where: { teamId_version: { teamId, version } },
    data: { status: "REJECTED", approvedAt: new Date(), approvedBy: rejectedBy },
  });
}
