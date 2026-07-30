import { describe, expect, it } from "vitest";
import { shadowBucket, shouldSampleShadow } from "./shadow-sampling.js";

describe("shadowBucket", () => {
  it("is deterministic -- the same prospectId always returns the same bucket", () => {
    const id = "prospect_123";
    const first = shadowBucket(id);
    const second = shadowBucket(id);
    expect(first).toBe(second);
  });

  it("always returns a value in [0, 99]", () => {
    for (const id of ["a", "b", "c", "prospect_1", "prospect_2", "another-id-here"]) {
      const bucket = shadowBucket(id);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThanOrEqual(99);
    }
  });

  it("is roughly uniform across a spread of synthetic ids (loose tolerance, not flaky)", () => {
    const counts = new Array(10).fill(0); // 10 buckets of 10 (0-9, 10-19, ...)
    for (let i = 0; i < 2000; i++) {
      const bucket = shadowBucket(`synthetic-prospect-${i}`);
      counts[Math.floor(bucket / 10)]++;
    }
    // Expected ~200 per decile; a badly broken hash (e.g. always 0) would
    // fail this by orders of magnitude -- loose enough not to be flaky.
    for (const count of counts) {
      expect(count).toBeGreaterThan(50);
      expect(count).toBeLessThan(500);
    }
  });
});

describe("shouldSampleShadow", () => {
  it("samplePercent 0 -- always false regardless of bucket", () => {
    for (const id of ["a", "b", "c", "prospect_1"]) {
      expect(shouldSampleShadow(id, 0)).toBe(false);
    }
  });

  it("samplePercent 100 -- always true regardless of bucket", () => {
    for (const id of ["a", "b", "c", "prospect_1"]) {
      expect(shouldSampleShadow(id, 100)).toBe(true);
    }
  });

  it("negative samplePercent is treated as 0", () => {
    expect(shouldSampleShadow("prospect_1", -5)).toBe(false);
  });

  it("samplePercent above 100 is treated as 100", () => {
    expect(shouldSampleShadow("prospect_1", 150)).toBe(true);
  });

  it("flips at exactly the fixture's own bucket boundary -- proves 'in the bottom N%' semantics, not just 'sometimes true'", () => {
    const id = "boundary-test-prospect";
    const bucket = shadowBucket(id);

    expect(shouldSampleShadow(id, bucket)).toBe(false); // percent == bucket -> still excluded (strict <)
    expect(shouldSampleShadow(id, bucket + 1)).toBe(true); // one more -> included
  });
});
