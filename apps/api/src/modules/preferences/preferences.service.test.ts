import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AuthContext } from "../../middleware/auth.js";
import type { UpdateUserPreferencesRequest } from "@argus/shared";

const repo = { getUserPreferences: vi.fn(), upsertUserPreferences: vi.fn() };
vi.mock("./preferences.repository.js", () => repo);

const { getPreferences, updatePreferences } = await import("./preferences.service.js");

const auth: AuthContext = { type: "user", userId: "user_1", teamId: "team_1", planTier: "FREE" };
const apiKeyAuthNoUser: AuthContext = { type: "api_key", teamId: "team_1", planTier: "FREE", apiKeyId: "key_1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPreferences", () => {
  it("throws FORBIDDEN when no user is attached to the auth context", async () => {
    await expect(getPreferences(apiKeyAuthNoUser)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns schema defaults with a null updatedAt when nothing was ever saved", async () => {
    repo.getUserPreferences.mockResolvedValue(null);

    const result = await getPreferences(auth);

    expect(result).toEqual({
      messageTone: "professional",
      messageLength: "medium",
      autoVerdict: false,
      sidebarPosition: "right",
      defaultChannel: "LINKEDIN",
      digestFrequency: "daily",
      updatedAt: null,
    });
  });

  it("returns the saved row when one exists", async () => {
    repo.getUserPreferences.mockResolvedValue({
      messageTone: "bold",
      messageLength: "short",
      autoVerdict: true,
      sidebarPosition: "left",
      defaultChannel: "EMAIL",
      digestFrequency: "weekly",
      updatedAt: new Date("2026-07-11T09:00:00Z"),
    });

    const result = await getPreferences(auth);

    expect(result.messageTone).toBe("bold");
    expect(result.updatedAt).toBe("2026-07-11T09:00:00.000Z");
  });
});

describe("updatePreferences", () => {
  const request: UpdateUserPreferencesRequest = {
    messageTone: "casual",
    messageLength: "long",
    autoVerdict: true,
    sidebarPosition: "left",
    defaultChannel: "EMAIL",
    digestFrequency: "never",
  };

  it("throws FORBIDDEN when no user is attached to the auth context", async () => {
    await expect(updatePreferences(apiKeyAuthNoUser, request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.upsertUserPreferences).not.toHaveBeenCalled();
  });

  it("upserts and returns the updated preferences", async () => {
    repo.upsertUserPreferences.mockResolvedValue({
      ...request,
      updatedAt: new Date("2026-07-11T09:00:00Z"),
    });

    const result = await updatePreferences(auth, request);

    expect(repo.upsertUserPreferences).toHaveBeenCalledWith("user_1", request);
    expect(result).toEqual({ ...request, updatedAt: "2026-07-11T09:00:00.000Z" });
  });
});
