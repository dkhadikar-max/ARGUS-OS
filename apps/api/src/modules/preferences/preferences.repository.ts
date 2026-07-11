import { prisma } from "@argus/database";
import type { UpdateUserPreferencesRequest } from "@argus/shared";

export function getUserPreferences(userId: string) {
  return prisma.userPreferences.findUnique({ where: { userId } });
}

export function upsertUserPreferences(userId: string, data: UpdateUserPreferencesRequest) {
  return prisma.userPreferences.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
