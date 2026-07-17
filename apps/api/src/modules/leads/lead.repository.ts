import { prisma, type LeadPath } from "@argus/database";

export function createLeadRecord(path: LeadPath) {
  return prisma.lead.create({ data: { path } });
}
