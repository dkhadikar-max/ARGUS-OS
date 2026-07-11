import { describe, expect, it, vi, beforeEach } from "vitest";

const increment = vi.fn();
const timing = vi.fn();
const close = vi.fn((cb?: (err?: Error) => void) => cb?.());
const constructorCalls: unknown[] = [];

// A plain class, not vi.fn(), since arrow-function mock implementations
// aren't constructible with `new` -- lib/datadog.ts does `new StatsD(...)`.
class MockStatsD {
  increment = increment;
  timing = timing;
  close = close;
  constructor(options?: unknown) {
    constructorCalls.push(options);
  }
}
vi.mock("hot-shots", () => ({ StatsD: MockStatsD }));

const warn = vi.fn();
vi.mock("./logger.js", () => ({ logger: { warn } }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  constructorCalls.length = 0;
});

describe("Datadog — configured (DATADOG_AGENT_HOST set)", () => {
  beforeEach(() => {
    vi.doMock("../config/env.js", () => ({
      env: { DATADOG_AGENT_HOST: "datadog-agent.internal", DATADOG_AGENT_PORT: 8125 },
    }));
  });

  it("constructs a StatsD client with the configured host/port and an argus.api. prefix", async () => {
    await import("./datadog.js");
    expect(constructorCalls[0]).toEqual(
      expect.objectContaining({ host: "datadog-agent.internal", port: 8125, prefix: "argus.api." }),
    );
  });

  it("forwards increment calls with tags", async () => {
    const { increment: inc } = await import("./datadog.js");
    inc("http.request.count", { method: "GET", route: "/health", status: "200" });
    expect(increment).toHaveBeenCalledWith(
      "http.request.count",
      { method: "GET", route: "/health", status: "200" },
    );
  });

  it("forwards timing calls with tags", async () => {
    const { timing: time } = await import("./datadog.js");
    time("http.request.duration", 42, { method: "GET", route: "/health", status: "200" });
    expect(timing).toHaveBeenCalledWith(
      "http.request.duration",
      42,
      { method: "GET", route: "/health", status: "200" },
    );
  });

  it("logs (not throws) via errorHandler when the underlying socket errors", async () => {
    await import("./datadog.js");
    const options = constructorCalls[0] as { errorHandler: (err: Error) => void };
    const err = new Error("ECONNREFUSED");
    expect(() => options.errorHandler(err)).not.toThrow();
    expect(warn).toHaveBeenCalledWith({ err }, "Datadog StatsD client error");
  });

  it("resolves closeDatadog by closing the underlying client", async () => {
    const { closeDatadog } = await import("./datadog.js");
    await expect(closeDatadog()).resolves.toBeUndefined();
    expect(close).toHaveBeenCalled();
  });
});

describe("Datadog — not configured (no DATADOG_AGENT_HOST)", () => {
  beforeEach(() => {
    vi.doMock("../config/env.js", () => ({
      env: { DATADOG_AGENT_HOST: undefined, DATADOG_AGENT_PORT: 8125 },
    }));
  });

  it("does not construct a StatsD client", async () => {
    await import("./datadog.js");
    expect(constructorCalls).toHaveLength(0);
  });

  it("no-ops increment/timing without throwing", async () => {
    const { increment: inc, timing: time } = await import("./datadog.js");
    expect(() => inc("http.request.count")).not.toThrow();
    expect(() => time("http.request.duration", 10)).not.toThrow();
    expect(increment).not.toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
  });

  it("resolves closeDatadog immediately with no client to close", async () => {
    const { closeDatadog } = await import("./datadog.js");
    await expect(closeDatadog()).resolves.toBeUndefined();
    expect(close).not.toHaveBeenCalled();
  });
});
