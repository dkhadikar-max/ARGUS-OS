import { describe, expect, it } from "vitest";
import { assertNoPII, findPIIViolations } from "./pii-check.js";

describe("findPIIViolations (denylist mode)", () => {
  it("returns no violations for a clean, PII-free object", () => {
    expect(findPIIViolations({ verdict: "YES", confidence: 82, tokens: 100 }, { mode: "denylist" })).toEqual([]);
  });

  it("flags a known-dangerous key name even without knowing the real value (structural check)", () => {
    const violations = findPIIViolations({ prospectName: "anything at all" }, { mode: "denylist" });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.path).toBe("prospectName");
  });

  it("flags every default forbidden key: prospectData, message, reasoning, key_evidence, context, subject, email", () => {
    const dirty = {
      prospectData: {},
      message: "hi",
      reasoning: "because",
      key_evidence: [],
      context: {},
      subject: {},
      email: "a@b.com",
    };
    const violations = findPIIViolations(dirty, { mode: "denylist" });
    expect(violations.map((v) => v.path).sort()).toEqual(
      ["context", "email", "key_evidence", "message", "prospectData", "reasoning", "subject"].sort(),
    );
  });

  it("finds a forbidden key nested arbitrarily deep, including inside arrays", () => {
    const nested = { level1: { level2: [{ level3: { prospectEmail: "leaked@example.com" } }] } };
    const violations = findPIIViolations(nested, { mode: "denylist" });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.path).toBe("level1.level2[0].level3.prospectEmail");
  });

  it("flags a real known sensitive VALUE even under a clean key name", () => {
    const violations = findPIIViolations(
      { notes: "Jane Prospect really liked the demo" },
      { mode: "denylist", forbiddenValues: ["Jane Prospect"] },
    );
    expect(violations.some((v) => v.reason.includes("Jane Prospect"))).toBe(true);
  });

  it("ignores empty-string forbidden values (would trivially match everything)", () => {
    expect(findPIIViolations({ anything: "at all" }, { mode: "denylist", forbiddenValues: [""] })).toEqual([]);
  });

  it("supports additionalForbiddenKeys for artifact-specific sensitive fields beyond the default list", () => {
    const violations = findPIIViolations({ customSecretField: "value" }, { mode: "denylist", additionalForbiddenKeys: [/customsecret/i] });
    expect(violations).toHaveLength(1);
  });
});

describe("findPIIViolations (allowlist mode)", () => {
  const allowedKeys = ["requestId", "packId", "verdict", "confidence"];

  it("returns no violations when every top-level key is allowed", () => {
    expect(findPIIViolations({ requestId: "r1", confidence: 82 }, { mode: "allowlist", allowedKeys })).toEqual([]);
  });

  it("flags any top-level key not in the allowlist -- fails closed by default, not just on known-dangerous names", () => {
    const violations = findPIIViolations({ requestId: "r1", prospectName: "Jane" }, { mode: "allowlist", allowedKeys });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.path).toBe("prospectName");
  });

  it("flags a completely unexpected new field too, not just ones matching a denylist pattern (the point of failing closed)", () => {
    const violations = findPIIViolations({ requestId: "r1", someBrandNewFieldNobodyAnticipated: 1 }, { mode: "allowlist", allowedKeys });
    expect(violations.map((v) => v.path)).toEqual(["someBrandNewFieldNobodyAnticipated"]);
  });

  it("is deliberately top-level only -- does not flag keys inside a nested object/array, which legitimately have their own different valid shape", () => {
    const violations = findPIIViolations(
      { requestId: "r1", timings: [{ stage: "research", latencyMs: 100 }] },
      { mode: "allowlist", allowedKeys: ["requestId", "timings"] },
    );
    expect(violations).toEqual([]);
  });

  it("returns no violations for non-object values (nothing to check)", () => {
    expect(findPIIViolations("a string", { mode: "allowlist", allowedKeys: [] })).toEqual([]);
    expect(findPIIViolations(null, { mode: "allowlist", allowedKeys: [] })).toEqual([]);
  });
});

describe("findPIIViolations (custom mode)", () => {
  it("delegates entirely to the provided validator", () => {
    const violations = findPIIViolations({ anything: "at all" }, { mode: "custom", validate: () => [{ path: "x", reason: "custom rule failed" }] });
    expect(violations).toEqual([{ path: "x", reason: "custom rule failed" }]);
  });

  it("supports a real project-specific rule, e.g. no free-text field over N characters", () => {
    const noLongFreeText = (value: unknown): { path: string; reason: string }[] => {
      if (value === null || typeof value !== "object") return [];
      return Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => typeof v === "string" && v.length > 20)
        .map(([k]) => ({ path: k, reason: "free-text field exceeds 20 characters" }));
    };
    const violations = findPIIViolations({ short: "ok", long: "this is a very long free-text field" }, { mode: "custom", validate: noLongFreeText });
    expect(violations).toEqual([{ path: "long", reason: "free-text field exceeds 20 characters" }]);
  });
});

describe("assertNoPII", () => {
  it("does not throw for a clean object", () => {
    expect(() => assertNoPII({ verdict: "YES", confidence: 82 }, { mode: "denylist" })).not.toThrow();
  });

  it("throws listing every violation when the object is dirty (denylist mode)", () => {
    expect(() => assertNoPII({ prospectName: "Jane", message: "hi" }, { mode: "denylist" })).toThrow(/prospectName.*message|message.*prospectName/s);
  });

  it("throws for an unexpected key in allowlist mode", () => {
    expect(() => assertNoPII({ requestId: "r1", extra: "field" }, { mode: "allowlist", allowedKeys: ["requestId"] })).toThrow(/extra/);
  });
});
