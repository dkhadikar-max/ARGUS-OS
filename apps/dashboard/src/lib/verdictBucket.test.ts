import { describe, expect, it } from "vitest";
import type { Verdict } from "@argus/shared";
import { VERDICT_BUCKETS, verdictBucket } from "./verdictBucket.js";

describe("verdictBucket", () => {
  it.each<[Verdict, string]>([
    ["STRONG_YES", "Contact"],
    ["YES", "Contact"],
    ["WAIT", "Wait"],
    ["PASS", "Ignore"],
    ["HARD_PASS", "Ignore"],
  ])("maps %s to %s", (verdict, bucket) => {
    expect(verdictBucket(verdict)).toBe(bucket);
  });

  it("exposes the 3 buckets in a stable, display-friendly order", () => {
    expect(VERDICT_BUCKETS).toEqual(["Contact", "Wait", "Ignore"]);
  });
});
