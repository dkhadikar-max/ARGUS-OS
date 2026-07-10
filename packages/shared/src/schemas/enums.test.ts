import { describe, expect, it } from "vitest";
import { ERROR_CODE_HTTP_STATUS, errorCodeSchema, scoreToVerdict } from "./enums.js";

describe("scoreToVerdict", () => {
  // Bible §8.7 verdict-to-weighted-score mapping — exact boundaries matter
  // because a decision one point off the boundary changes the rep's action.
  it.each([
    [100, "STRONG_YES"],
    [90, "STRONG_YES"],
    [89, "YES"],
    [70, "YES"],
    [69, "WAIT"],
    [50, "WAIT"],
    [49, "PASS"],
    [30, "PASS"],
    [29, "HARD_PASS"],
    [0, "HARD_PASS"],
  ] as const)("maps score %i to %s", (score, expected) => {
    expect(scoreToVerdict(score)).toBe(expected);
  });
});

describe("ERROR_CODE_HTTP_STATUS", () => {
  it("has a status code for every documented error code (Bible §10.7)", () => {
    for (const code of errorCodeSchema.options) {
      expect(ERROR_CODE_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it("matches the exact status codes from the Bible §10.7 table", () => {
    expect(ERROR_CODE_HTTP_STATUS.UNAUTHORIZED).toBe(401);
    expect(ERROR_CODE_HTTP_STATUS.FORBIDDEN).toBe(403);
    expect(ERROR_CODE_HTTP_STATUS.NOT_FOUND).toBe(404);
    expect(ERROR_CODE_HTTP_STATUS.VALIDATION_ERROR).toBe(422);
    expect(ERROR_CODE_HTTP_STATUS.RATE_LIMITED).toBe(429);
    expect(ERROR_CODE_HTTP_STATUS.AI_UNAVAILABLE).toBe(503);
    expect(ERROR_CODE_HTTP_STATUS.ENRICHMENT_FAILED).toBe(502);
    expect(ERROR_CODE_HTTP_STATUS.DECISION_STALE).toBe(409);
    expect(ERROR_CODE_HTTP_STATUS.TEAM_LIMIT_REACHED).toBe(403);
  });
});
