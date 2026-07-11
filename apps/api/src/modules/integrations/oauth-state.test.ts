import { describe, expect, it, vi, beforeEach } from "vitest";

const redis = { set: vi.fn(), get: vi.fn(), del: vi.fn() };
vi.mock("../../lib/redis.js", () => ({ redis }));

const { createOAuthState, consumeOAuthState } = await import("./oauth-state.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createOAuthState", () => {
  it("stores the team/user under a random single-use token with a TTL", async () => {
    const state = await createOAuthState({ teamId: "team_1", userId: "u1" });

    expect(state).toMatch(/^[0-9a-f]{48}$/);
    expect(redis.set).toHaveBeenCalledWith(
      `slack_oauth_state:${state}`,
      JSON.stringify({ teamId: "team_1", userId: "u1" }),
      "EX",
      600,
    );
  });

  it("generates a different token on every call", async () => {
    const a = await createOAuthState({ teamId: "team_1", userId: "u1" });
    const b = await createOAuthState({ teamId: "team_1", userId: "u1" });
    expect(a).not.toBe(b);
  });
});

describe("consumeOAuthState", () => {
  it("returns null for an unknown/expired state without touching Redis further", async () => {
    redis.get.mockResolvedValue(null);
    const result = await consumeOAuthState("nonexistent");
    expect(result).toBeNull();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("returns the stored data and deletes it (single-use)", async () => {
    redis.get.mockResolvedValue(JSON.stringify({ teamId: "team_1", userId: "u1" }));
    const result = await consumeOAuthState("state123");

    expect(result).toEqual({ teamId: "team_1", userId: "u1" });
    expect(redis.del).toHaveBeenCalledWith("slack_oauth_state:state123");
  });
});
