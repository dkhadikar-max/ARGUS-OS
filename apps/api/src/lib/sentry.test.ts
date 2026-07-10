import { describe, expect, it, vi, beforeEach } from "vitest";

const init = vi.fn();
const captureException = vi.fn();
vi.mock("@sentry/node", () => ({ init, captureException }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("Sentry — configured (SENTRY_DSN set)", () => {
  beforeEach(() => {
    vi.doMock("../config/env.js", () => ({
      env: { SENTRY_DSN: "https://key@sentry.io/1", NODE_ENV: "production" },
    }));
  });

  it("initializes Sentry with the configured DSN and environment", async () => {
    const { initSentry } = await import("./sentry.js");
    initSentry();
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: "https://key@sentry.io/1", environment: "production" }),
    );
  });

  it("uses a lower trace sample rate in production (Bible §19.1 performance)", async () => {
    const { initSentry } = await import("./sentry.js");
    initSentry();
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ tracesSampleRate: 0.1 }));
  });

  it("forwards exceptions with extra context", async () => {
    const { captureException: capture } = await import("./sentry.js");
    const err = new Error("boom");
    capture(err, { path: "/api/v1/decisions" });
    expect(captureException).toHaveBeenCalledWith(err, { extra: { path: "/api/v1/decisions" } });
  });
});

describe("Sentry — not configured (no SENTRY_DSN)", () => {
  beforeEach(() => {
    vi.doMock("../config/env.js", () => ({
      env: { SENTRY_DSN: undefined, NODE_ENV: "development" },
    }));
  });

  it("does not initialize the SDK", async () => {
    const { initSentry } = await import("./sentry.js");
    initSentry();
    expect(init).not.toHaveBeenCalled();
  });

  it("no-ops captureException without throwing", async () => {
    const { captureException: capture } = await import("./sentry.js");
    expect(() => capture(new Error("boom"))).not.toThrow();
    expect(captureException).not.toHaveBeenCalled();
  });
});
