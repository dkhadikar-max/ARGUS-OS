import type { UpdateUserPreferencesRequest, UserPreferencesResponse } from "@argus/shared";
import type { AuthContext } from "../../middleware/auth.js";
import { AppError } from "@argus/shared";
import { getUserPreferences, upsertUserPreferences } from "./preferences.repository.js";

// Mirrors packages/database/prisma/schema.prisma's UserPreferences @default
// values exactly -- a user who never opened Settings still has real,
// documented preferences in effect (every read path already falls back to
// these via Prisma's own defaults), this just makes that visible via GET
// without writing a row on a read.
const DEFAULT_PREFERENCES: Omit<UserPreferencesResponse, "updatedAt"> = {
  messageTone: "professional",
  messageLength: "medium",
  autoVerdict: false,
  sidebarPosition: "right",
  defaultChannel: "LINKEDIN",
  digestFrequency: "daily",
};

export async function getPreferences(auth: AuthContext): Promise<UserPreferencesResponse> {
  if (!auth.userId) {
    throw new AppError("FORBIDDEN", "A user session is required to view preferences");
  }

  const existing = await getUserPreferences(auth.userId);
  if (!existing) {
    return { ...DEFAULT_PREFERENCES, updatedAt: null };
  }

  return {
    messageTone: existing.messageTone as UserPreferencesResponse["messageTone"],
    messageLength: existing.messageLength as UserPreferencesResponse["messageLength"],
    autoVerdict: existing.autoVerdict,
    sidebarPosition: existing.sidebarPosition as UserPreferencesResponse["sidebarPosition"],
    defaultChannel: existing.defaultChannel,
    digestFrequency: existing.digestFrequency as UserPreferencesResponse["digestFrequency"],
    updatedAt: existing.updatedAt.toISOString(),
  };
}

export async function updatePreferences(
  auth: AuthContext,
  request: UpdateUserPreferencesRequest,
): Promise<UserPreferencesResponse> {
  if (!auth.userId) {
    throw new AppError("FORBIDDEN", "A user session is required to update preferences");
  }

  const updated = await upsertUserPreferences(auth.userId, request);

  return {
    messageTone: updated.messageTone as UserPreferencesResponse["messageTone"],
    messageLength: updated.messageLength as UserPreferencesResponse["messageLength"],
    autoVerdict: updated.autoVerdict,
    sidebarPosition: updated.sidebarPosition as UserPreferencesResponse["sidebarPosition"],
    defaultChannel: updated.defaultChannel,
    digestFrequency: updated.digestFrequency as UserPreferencesResponse["digestFrequency"],
    updatedAt: updated.updatedAt.toISOString(),
  };
}
