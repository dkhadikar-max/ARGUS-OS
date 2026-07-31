import { describe, expect, it } from "vitest";
import { raceWithTimeout, ShadowTimeoutError } from "./shadow-timeout.js";

describe("raceWithTimeout", () => {
  it("resolves with the inner value when it settles before the timeout", async () => {
    const result = await raceWithTimeout(Promise.resolve("ok"), 1000);
    expect(result).toBe("ok");
  });

  it("rejects with ShadowTimeoutError when the inner promise is slower than the timeout", async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve("too late"), 200));
    await expect(raceWithTimeout(slow, 20)).rejects.toBeInstanceOf(ShadowTimeoutError);
  });

  it("rejects with the inner promise's own error when it rejects before the timeout", async () => {
    const failing = Promise.reject(new Error("real failure"));
    await expect(raceWithTimeout(failing, 1000)).rejects.toThrow("real failure");
  });

  it("a late orphaned success after timeout does not affect the already-settled outer promise", async () => {
    let resolveInner!: (value: string) => void;
    const inner = new Promise<string>((resolve) => {
      resolveInner = resolve;
    });
    const race = raceWithTimeout(inner, 20);

    await expect(race).rejects.toBeInstanceOf(ShadowTimeoutError);

    resolveInner("late value");
    await new Promise((r) => setTimeout(r, 10)); // let the late resolution actually happen

    // Re-awaiting the same (already-settled) promise must still yield the
    // original timeout rejection, not flip to the late value.
    await expect(race).rejects.toBeInstanceOf(ShadowTimeoutError);
  });

  it("a late orphaned rejection after timeout produces no unhandledRejection", async () => {
    const captured: unknown[] = [];
    const onUnhandled = (reason: unknown) => captured.push(reason);
    process.on("unhandledRejection", onUnhandled);

    try {
      let rejectInner!: (err: Error) => void;
      const inner = new Promise<string>((_resolve, reject) => {
        rejectInner = reject;
      });
      const race = raceWithTimeout(inner, 20);

      await expect(race).rejects.toBeInstanceOf(ShadowTimeoutError);

      rejectInner(new Error("late failure"));
      await new Promise((r) => setTimeout(r, 10)); // give Node a turn to flag an unhandled rejection if one occurred

      expect(captured).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
