import { prisma, type EvidenceEdgeRelation } from "@argus/database";

/**
 * v4 roadmap Phase 2 -- Evidence Graph CRUD, backed by the additive
 * `EvidenceEdge` table (Postgres, not a graph database -- see the schema
 * comment on that model for why). Nothing in the agent pipeline calls this
 * yet; Retriever Registry (Phase 5) is the first real consumer, per this
 * phase's explicit "do not implement Retrieval yet" scope.
 */

export interface EvidenceEdgeInput {
  fromId: string;
  toId: string;
  relation: EvidenceEdgeRelation;
  strength?: number;
}

/** Creates a directed edge between two Evidence rows. Idempotent on
 *  (fromId, toId, relation) -- re-recording the same relationship (e.g. a
 *  re-run of an agent stage that notices the same corroboration again)
 *  updates strength rather than erroring or duplicating rows. */
export function createEvidenceEdge(input: EvidenceEdgeInput) {
  return prisma.evidenceEdge.upsert({
    where: {
      fromId_toId_relation: { fromId: input.fromId, toId: input.toId, relation: input.relation },
    },
    create: {
      fromId: input.fromId,
      toId: input.toId,
      relation: input.relation,
      strength: input.strength ?? 0.5,
    },
    update: {
      strength: input.strength ?? 0.5,
    },
  });
}

/** All edges touching a given evidence node, in either direction. */
export function getEdgesForEvidence(evidenceId: string) {
  return prisma.evidenceEdge.findMany({
    where: { OR: [{ fromId: evidenceId }, { toId: evidenceId }] },
    include: { from: true, to: true },
  });
}

/** Evidence nodes that corroborate the given evidence node -- i.e. edges
 *  where relation is CORROBORATES and this evidence is the target. This is
 *  the exact shape the architecture doc's RiskRetriever (Phase 5) scores on
 *  ("corroboration = len(evidence.corroborates)"). */
export function getCorroborations(evidenceId: string) {
  return prisma.evidenceEdge.findMany({
    where: { toId: evidenceId, relation: "CORROBORATES" },
    include: { from: true },
  });
}

/** Evidence nodes that contradict the given evidence node. */
export function getContradictions(evidenceId: string) {
  return prisma.evidenceEdge.findMany({
    where: { toId: evidenceId, relation: "CONTRADICTS" },
    include: { from: true },
  });
}

export function deleteEvidenceEdge(id: string) {
  return prisma.evidenceEdge.delete({ where: { id } });
}
