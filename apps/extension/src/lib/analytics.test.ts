import { describe, expect, it, vi, beforeEach } from "vitest";

const init = vi.fn();
const identifyMock = vi.fn();
const capture = vi.fn();
vi.mock("posthog-js/dist/module.slim.no-external", () => ({
  default: { init, identify: identifyMock, capture },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("analytics — VITE_POSTHOG_KEY unset", () => {
  it("no-ops track()/identify() without initializing the SDK", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    const { track, identify } = await import("./analytics.js");

    identify("user_1");
    track({
      name: "sidebar_opened",
      properties: { prospect_id: "https://linkedin.com/in/x", source: "profile", load_time_ms: 100 },
    });

    expect(init).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });
});

describe("analytics — VITE_POSTHOG_KEY configured", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.posthog.com");
  });

  it("initializes with autocapture/pageview/session-recording disabled (Bible §11.1 is a closed event set)", async () => {
    const { track } = await import("./analytics.js");
    track({
      name: "sidebar_opened",
      properties: { prospect_id: "https://linkedin.com/in/x", source: "profile", load_time_ms: 100 },
    });

    expect(init).toHaveBeenCalledWith(
      "phc_test_key",
      expect.objectContaining({
        api_host: "https://eu.posthog.com",
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: true,
      }),
    );
  });

  it("captures the exact Bible §11.1 event name and properties", async () => {
    const { track } = await import("./analytics.js");
    track({
      name: "message_copied",
      properties: { decision_id: "dec_1", channel: "LINKEDIN", tone: "professional", was_edited: false },
    });

    expect(capture).toHaveBeenCalledWith("message_copied", {
      decision_id: "dec_1",
      channel: "LINKEDIN",
      tone: "professional",
      was_edited: false,
    });
  });

  it("identifies once and skips redundant re-identification for the same user", async () => {
    const { identify } = await import("./analytics.js");
    identify("user_1");
    identify("user_1");
    expect(identifyMock).toHaveBeenCalledTimes(1);
  });

  it("re-identifies when the signed-in user changes", async () => {
    const { identify } = await import("./analytics.js");
    identify("user_1");
    identify("user_2");
    expect(identifyMock).toHaveBeenCalledTimes(2);
    expect(identifyMock).toHaveBeenNthCalledWith(2, "user_2");
  });
});
