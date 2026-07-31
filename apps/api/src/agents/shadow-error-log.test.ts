import { describe, expect, it, beforeEach } from "vitest";
import { recordShadowError, countShadowErrorsSince, __resetShadowErrorLogForTests } from "./shadow-error-log.js";

beforeEach(() => {
  __resetShadowErrorLogForTests();
});

function fakeClock(startAt = 0) {
  let now = startAt;
  return { now: () => now, advance: (ms: number) => { now += ms; } };
}

describe("shadow-error-log", () => {
  it("counts entries recorded within the window", () => {
    const clock = fakeClock(1_000_000);
    recordShadowError("evaluate_threw", clock.now);
    recordShadowError("timeout", clock.now);

    expect(countShadowErrorsSince(60_000, clock.now)).toBe(2);
  });

  it("excludes entries recorded before the window", () => {
    const clock = fakeClock(1_000_000);
    recordShadowError("evaluate_threw", clock.now);
    clock.advance(61_000);
    recordShadowError("timeout", clock.now);

    expect(countShadowErrorsSince(60_000, clock.now)).toBe(1);
  });

  it("returns 0 when nothing has been recorded", () => {
    expect(countShadowErrorsSince(60_000)).toBe(0);
  });

  it("caps at MAX_ENTRIES, evicting the oldest first", () => {
    const clock = fakeClock(0);
    for (let i = 0; i < 500; i++) {
      recordShadowError("evaluate_threw", clock.now);
      clock.advance(1);
    }
    // One more, past the cap -- the very first (oldest, timestamp 0) entry
    // should have been evicted.
    recordShadowError("evaluate_threw", clock.now);

    // A window covering everything from t=0 onward would be 501 without
    // eviction; with the oldest evicted, only 500 remain.
    expect(countShadowErrorsSince(1_000_000, clock.now)).toBe(500);
  });

  it("__resetShadowErrorLogForTests clears all entries", () => {
    recordShadowError("evaluate_threw");
    __resetShadowErrorLogForTests();

    expect(countShadowErrorsSince(60_000)).toBe(0);
  });
});
