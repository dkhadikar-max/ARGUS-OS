// Reusable PII/raw-evidence check, per review feedback after the
// ExecutionTrace audit found a real leak (DecisionState.subject.prospectName,
// DecisionState.context's raw prospectData, JudgeAgentOutput's drafted
// message text) that a one-off inline test caught but a future artifact
// wouldn't automatically be checked against. Intended for any artifact
// meant to be retained/logged/compared as operational data -- ExecutionTrace
// today, and per the review's own list: shadow logs, benchmark exports,
// telemetry payloads, analytics events, whenever those get built.
//
// Two complementary checks, since either alone misses real cases:
//   - Key-based (structural): recursively walks the object and flags any
//     field NAME matching a known-dangerous pattern (prospectName,
//     prospectData, message, reasoning, key_evidence, etc.) -- catches a
//     structural leak even without knowing the specific VALUES a test
//     used, which is what makes this reusable across artifacts that don't
//     share ExecutionTrace's exact shape.
//   - Value-based: given real, known sensitive values from the test's own
//     fixture data (e.g. a real prospectName string), asserts none of them
//     appear anywhere in the serialized object -- catches a leak through a
//     field name this file's default list doesn't yet know about.
//
// Deliberately excluded from tsconfig.build.json (src/test) -- this is
// test-only infrastructure, never shipped.

export const DEFAULT_FORBIDDEN_PII_KEYS: RegExp[] = [
  /prospectname/i,
  /prospectdata/i,
  /prospectemail/i,
  /prospectphone/i,
  /^email$/i,
  /^phone$/i,
  /linkedin/i,
  /rawevidence/i,
  /^message$/i,
  /^reasoning$/i,
  /key_?evidence/i,
  /^context$/i,
  /^subject$/i,
  /confidence_explanation/i,
];

export interface PIICheckOptions {
  /** Real, known sensitive string values that must not appear anywhere in
   *  the serialized object -- e.g. a test's own real prospectName/
   *  prospectId fixture values. Empty values are ignored (an empty string
   *  would trivially "match" everything). */
  forbiddenValues?: string[];
  /** Additional field-name patterns to flag beyond DEFAULT_FORBIDDEN_PII_KEYS
   *  -- an artifact with its own domain-specific sensitive fields (e.g. a
   *  future shadow log with a differently-named raw payload field) extends
   *  the default list rather than replacing it. */
  additionalForbiddenKeys?: RegExp[];
}

export interface PIIViolation {
  path: string;
  reason: string;
}

function walk(node: unknown, path: string, forbiddenKeys: RegExp[], violations: PIIViolation[]): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => walk(item, `${path}[${i}]`, forbiddenKeys, violations));
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (forbiddenKeys.some((pattern) => pattern.test(key))) {
      violations.push({ path: keyPath, reason: `forbidden key "${key}"` });
    }
    walk(value, keyPath, forbiddenKeys, violations);
  }
}

/** Returns every violation found (empty array if clean) -- use this
 *  directly when a test wants to inspect/report violations rather than
 *  just fail immediately. */
export function findPIIViolations(value: unknown, options: PIICheckOptions = {}): PIIViolation[] {
  const forbiddenKeys = [...DEFAULT_FORBIDDEN_PII_KEYS, ...(options.additionalForbiddenKeys ?? [])];
  const violations: PIIViolation[] = [];
  walk(value, "", forbiddenKeys, violations);

  const forbiddenValues = (options.forbiddenValues ?? []).filter((v) => v.length > 0);
  if (forbiddenValues.length > 0) {
    const serialized = JSON.stringify(value);
    for (const forbidden of forbiddenValues) {
      if (serialized.includes(forbidden)) {
        violations.push({ path: "(serialized)", reason: `forbidden value "${forbidden}" found` });
      }
    }
  }

  return violations;
}

/** Throws with every violation listed if the object contains any forbidden
 *  key or value -- the assertion form for a test that just wants a
 *  pass/fail. */
export function assertNoPII(value: unknown, options: PIICheckOptions = {}): void {
  const violations = findPIIViolations(value, options);
  if (violations.length > 0) {
    const details = violations.map((v) => `  - ${v.path}: ${v.reason}`).join("\n");
    throw new Error(`PII/sensitive-data check failed (${violations.length} violation(s)):\n${details}`);
  }
}
