import { describe, expect, it } from "vitest";
import { assertNoPII, findPIIViolations } from "./pii-check.js";

describe("findPIIViolations", () => {
  it("returns no violations for a clean, PII-free object", () => {
    expect(findPIIViolations({ verdict: "YES", confidence: 82, tokens: 100 })).toEqual([]);
  });

  it("flags a known-dangerous key name even without knowing the real value (structural check)", () => {
    const violations = findPIIViolations({ prospectName: "anything at all" });
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
    const violations = findPIIViolations(dirty);
    expect(violations.map((v) => v.path).sort()).toEqual(
      ["context", "email", "key_evidence", "message", "prospectData", "reasoning", "subject"].sort(),
    );
  });

  it("finds a forbidden key nested arbitrarily deep, including inside arrays", () => {
    const nested = { level1: { level2: [{ level3: { prospectEmail: "leaked@example.com" } }] } };
    const violations = findPIIViolations(nested);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.path).toBe("level1.level2[0].level3.prospectEmail");
  });

  it("flags a real known sensitive VALUE even under a clean key name", () => {
    const violations = findPIIViolations({ notes: "Jane Prospect really liked the demo" }, { forbiddenValues: ["Jane Prospect"] });
    expect(violations.some((v) => v.reason.includes("Jane Prospect"))).toBe(true);
  });

  it("ignores empty-string forbidden values (would trivially match everything)", () => {
    expect(findPIIViolations({ anything: "at all" }, { forbiddenValues: [""] })).toEqual([]);
  });

  it("supports additionalForbiddenKeys for artifact-specific sensitive fields beyond the default list", () => {
    const violations = findPIIViolations({ customSecretField: "value" }, { additionalForbiddenKeys: [/customsecret/i] });
    expect(violations).toHaveLength(1);
  });
});

describe("assertNoPII", () => {
  it("does not throw for a clean object", () => {
    expect(() => assertNoPII({ verdict: "YES", confidence: 82 })).not.toThrow();
  });

  it("throws listing every violation when the object is dirty", () => {
    expect(() => assertNoPII({ prospectName: "Jane", message: "hi" })).toThrow(/prospectName.*message|message.*prospectName/s);
  });
});
