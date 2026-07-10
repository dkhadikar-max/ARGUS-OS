import { describe, expect, it, vi, beforeEach } from "vitest";

const capture = vi.fn();
const identify = vi.fn();
const shutdown = vi.fn();
class MockPostHog {
  capture = capture;
  identify = identify;
  shutdown = shutdown;
}
vi.mock("posthog-node", () => ({ PostHog: MockPostHog }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("analytics — configured (POSTHOG_API_KEY set)", () => {
  beforeEach(() => {
    vi.doMock("../config/env.js", () => ({
      env: { POSTHOG_API_KEY: "phc_test", POSTHOG_HOST: "https://app.posthog.com" },
    }));
  });

  it("captures an event with the exact Bible §11.1 name and properties", async () => {
    const { track } = await import("./analytics.js");
    track("user_1", {
      name: "outcome_logged",
      properties: {
        decision_id: "dec_1",
        outcome_type: "MEETING_BOOKED",
        time_to_outcome_days: 1,
        feedback_provided: true,
      },
    });

    expect(capture).toHaveBeenCalledWith({
      distinctId: "user_1",
      event: "outcome_logged",
      properties: {
        decision_id: "dec_1",
        outcome_type: "MEETING_BOOKED",
        time_to_outcome_days: 1,
        feedback_provided: true,
      },
    });
  });

  it("identifies a user with §11.1 User Properties", async () => {
    const { identify: identifyUser } = await import("./analytics.js");
    identifyUser("user_1", { role: "SDR", weekly_active: true });
    expect(identify).toHaveBeenCalledWith({
      distinctId: "user_1",
      properties: { role: "SDR", weekly_active: true },
    });
  });

  it("shuts down the underlying client", async () => {
    const { shutdownAnalytics } = await import("./analytics.js");
    await shutdownAnalytics();
    expect(shutdown).toHaveBeenCalled();
  });
});

describe("analytics — not configured (no POSTHOG_API_KEY)", () => {
  beforeEach(() => {
    vi.doMock("../config/env.js", () => ({
      env: { POSTHOG_API_KEY: undefined, POSTHOG_HOST: "https://app.posthog.com" },
    }));
  });

  it("no-ops track() without throwing or constructing a client", async () => {
    const { track } = await import("./analytics.js");
    expect(() =>
      track("user_1", {
        name: "outcome_logged",
        properties: { decision_id: "d1", outcome_type: "NO_RESPONSE", time_to_outcome_days: null, feedback_provided: false },
      }),
    ).not.toThrow();
    expect(capture).not.toHaveBeenCalled();
  });
});
