import { describe, expect, it } from "vitest";
import { recencyScore, sourceQuality } from "./scoring.js";

describe("recencyScore", () => {
  it("returns 1.0 for evidence extracted right now", () => {
    const now = new Date("2026-07-01T00:00:00Z");
    expect(recencyScore(now, now)).toBeCloseTo(1.0);
  });

  it("decays linearly toward 0 as the evidence ages toward 90 days", () => {
    const now = new Date("2026-07-01T00:00:00Z");
    const fortyFiveDaysAgo = new Date("2026-05-17T00:00:00Z");
    expect(recencyScore(fortyFiveDaysAgo, now)).toBeCloseTo(0.5, 1);
  });

  it("never goes negative for evidence older than 90 days", () => {
    const now = new Date("2026-07-01T00:00:00Z");
    const oneYearAgo = new Date("2025-07-01T00:00:00Z");
    expect(recencyScore(oneYearAgo, now)).toBe(0);
  });
});

describe("sourceQuality", () => {
  it("ranks CRM highest and INFERRED lowest", () => {
    expect(sourceQuality("CRM")).toBe(1.0);
    expect(sourceQuality("INFERRED")).toBeLessThan(sourceQuality("LINKEDIN"));
    expect(sourceQuality("LINKEDIN")).toBeLessThan(sourceQuality("APOLLO"));
  });
});
