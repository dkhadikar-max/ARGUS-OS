import { prisma } from "@argus/database";

export function getCompanyMemory(teamId: string) {
  return prisma.companyMemory.findUnique({ where: { teamId } });
}
