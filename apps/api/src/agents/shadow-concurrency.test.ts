import { describe, expect, it, beforeEach } from "vitest";
import { tryAcquireShadowSlot, releaseShadowSlot, getShadowInFlightCount, __resetShadowConcurrencyForTests } from "./shadow-concurrency.js";

beforeEach(() => {
  __resetShadowConcurrencyForTests();
});

describe("shadow-concurrency", () => {
  it("acquires a slot under the cap", () => {
    expect(tryAcquireShadowSlot(2)).toBe(true);
  });

  it("returns false once at the cap, without incrementing further", () => {
    expect(tryAcquireShadowSlot(2)).toBe(true);
    expect(tryAcquireShadowSlot(2)).toBe(true);
    expect(tryAcquireShadowSlot(2)).toBe(false);
    expect(tryAcquireShadowSlot(2)).toBe(false); // still false, not somehow drifting
  });

  it("releaseShadowSlot frees a slot so a subsequent acquire succeeds", () => {
    tryAcquireShadowSlot(1);
    expect(tryAcquireShadowSlot(1)).toBe(false);

    releaseShadowSlot();

    expect(tryAcquireShadowSlot(1)).toBe(true);
  });

  it("releaseShadowSlot never drives the counter negative (no phantom capacity)", () => {
    releaseShadowSlot(); // release with nothing acquired
    releaseShadowSlot();

    expect(tryAcquireShadowSlot(1)).toBe(true);
    expect(tryAcquireShadowSlot(1)).toBe(false); // still capped at 1, not 1 - (-2) = 3
  });

  it("maxConcurrent is honored per-call, not cached from an earlier call", () => {
    expect(tryAcquireShadowSlot(1)).toBe(true);
    expect(tryAcquireShadowSlot(1)).toBe(false);

    // A later call raises the ceiling -- must be respected immediately,
    // proving the cap is read fresh each call rather than captured once.
    expect(tryAcquireShadowSlot(5)).toBe(true);
  });

  it("getShadowInFlightCount reflects real acquire/release state", () => {
    expect(getShadowInFlightCount()).toBe(0);

    tryAcquireShadowSlot(3);
    tryAcquireShadowSlot(3);
    expect(getShadowInFlightCount()).toBe(2);

    releaseShadowSlot();
    expect(getShadowInFlightCount()).toBe(1);
  });
});
