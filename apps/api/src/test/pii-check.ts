// Reusable PII/raw-evidence check, per review feedback after the
// ExecutionTrace audit found a real leak (DecisionState.subject.prospectName,
// DecisionState.context's raw prospectData, JudgeAgentOutput's drafted
// message text) that a one-off inline test caught but a future artifact
// wouldn't automatically be checked against. Intended for any artifact
// meant to be retained/logged/compared as operational data -- ExecutionTrace
// today; shadow logs, benchmark exports, telemetry payloads, analytics
// events per the review's own list, whenever those get built.
//
// Three modes, per review feedback that a denylist alone doesn't scale --
// an artifact can be checked whichever way fits it best:
//   - denylist: forbidden key-name patterns and/or known sensitive values
//     must not appear anywhere (recursive). Right for an artifact where
//     you know what's dangerous but not the full valid shape.
//   - allowlist: only explicitly allowed TOP-LEVEL keys may exist -- safer
//     by default (fails closed on anything new/unexpected) than trying to
//     enumerate every possible sensitive field. Deliberately top-level
//     only, not recursive: a nested value (e.g. one entry of an array
//     field) legitimately has its own different valid key set, so
//     re-applying the same allowlist at every depth would be wrong, not
//     stricter. Real, scoped limitation -- not silently claimed as
//     full-depth coverage.
//   - custom: project-specific checks (e.g. "no free-text fields over N
//     characters") that don't fit either shape.
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

export interface PIIViolation {
  path: string;
  reason: string;
}

export type PIICheckOptions =
  | {
      mode: "denylist";
      /** Real, known sensitive string values that must not appear anywhere
       *  in the serialized object -- e.g. a test's own real prospectName/
       *  prospectId fixture values. Empty values are ignored (an empty
       *  string would trivially "match" everything). */
      forbiddenValues?: string[];
      /** Additional field-name patterns beyond DEFAULT_FORBIDDEN_PII_KEYS. */
      additionalForbiddenKeys?: RegExp[];
    }
  | {
      mode: "allowlist";
      /** Top-level keys allowed to exist. Anything else fails. */
      allowedKeys: string[];
    }
  | {
      mode: "custom";
      validate: (value: unknown) => PIIViolation[];
    };

function walkDenylist(node: unknown, path: string, forbiddenKeys: RegExp[], violations: PIIViolation[]): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkDenylist(item, `${path}[${i}]`, forbiddenKeys, violations));
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (forbiddenKeys.some((pattern) => pattern.test(key))) {
      violations.push({ path: keyPath, reason: `forbidden key "${key}"` });
    }
    walkDenylist(value, keyPath, forbiddenKeys, violations);
  }
}

function findDenylistViolations(value: unknown, forbiddenValues: string[], additionalForbiddenKeys: RegExp[]): PIIViolation[] {
  const forbiddenKeys = [...DEFAULT_FORBIDDEN_PII_KEYS, ...additionalForbiddenKeys];
  const violations: PIIViolation[] = [];
  walkDenylist(value, "", forbiddenKeys, violations);

  const realForbiddenValues = forbiddenValues.filter((v) => v.length > 0);
  if (realForbiddenValues.length > 0) {
    const serialized = JSON.stringify(value);
    for (const forbidden of realForbiddenValues) {
      if (serialized.includes(forbidden)) {
        violations.push({ path: "(serialized)", reason: `forbidden value "${forbidden}" found` });
      }
    }
  }
  return violations;
}

function findAllowlistViolations(value: unknown, allowedKeys: string[]): PIIViolation[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  const allowed = new Set(allowedKeys);
  const violations: PIIViolation[] = [];
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (!allowed.has(key)) {
      violations.push({ path: key, reason: `key "${key}" not in allowlist` });
    }
  }
  return violations;
}

/** Returns every violation found (empty array if clean) -- use this
 *  directly when a test wants to inspect/report violations rather than
 *  just fail immediately. */
export function findPIIViolations(value: unknown, options: PIICheckOptions): PIIViolation[] {
  switch (options.mode) {
    case "denylist":
      return findDenylistViolations(value, options.forbiddenValues ?? [], options.additionalForbiddenKeys ?? []);
    case "allowlist":
      return findAllowlistViolations(value, options.allowedKeys);
    case "custom":
      return options.validate(value);
  }
}

/** Throws with every violation listed if the check fails -- the assertion
 *  form for a test that just wants a pass/fail. */
export function assertNoPII(value: unknown, options: PIICheckOptions): void {
  const violations = findPIIViolations(value, options);
  if (violations.length > 0) {
    const details = violations.map((v) => `  - ${v.path}: ${v.reason}`).join("\n");
    throw new Error(`PII/sensitive-data check failed (${violations.length} violation(s), mode="${options.mode}"):\n${details}`);
  }
}
