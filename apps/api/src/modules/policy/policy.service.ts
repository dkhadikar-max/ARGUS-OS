import {
  AppError,
  type PolicyFlag,
  type PolicyResponse,
  type PolicyRule,
  type PolicyVersionHistoryResponse,
  type UpdatePolicyRequest,
} from "@argus/shared";
import { ADMIN_ROLES, type AuthContext } from "../../middleware/auth.js";
import { recordAudit, type RequestMeta } from "../../lib/audit.js";
import {
  getPolicy,
  getPolicyVersion,
  getPolicyVersionHistory,
  recordPolicyVersion,
  upsertPolicy,
} from "./policy.repository.js";

export async function getPolicyForTeam(auth: AuthContext): Promise<PolicyResponse> {
  const policy = await getPolicy(auth.teamId);
  if (!policy) {
    return { teamId: auth.teamId, rules: [], version: 0, updatedAt: null };
  }
  return {
    teamId: auth.teamId,
    rules: policy.rules as never,
    version: policy.version,
    updatedAt: policy.updatedAt.toISOString(),
  };
}

export async function updatePolicyForTeam(
  auth: AuthContext,
  request: UpdatePolicyRequest,
  meta?: RequestMeta,
): Promise<PolicyResponse> {
  // Same admin-only gate icp.service.ts's updateIcpForTeam uses -- a
  // Policy Check that any rep could edit would be governance in name only.
  if (!auth.role || !ADMIN_ROLES.has(auth.role)) {
    throw new AppError("FORBIDDEN", "Only a team admin can edit policy rules");
  }

  const updated = await upsertPolicy(auth.teamId, request.rules);

  // v4 roadmap Phase 5 -- additive snapshot alongside the unchanged upsert
  // above, so this version's exact rules stay queryable/rollback-able even
  // after a later save overwrites PolicyDefinition.rules. Best-effort in
  // spirit (mirrors learning.service.ts's own "must never fail the request
  // that triggered it" pattern): if this insert fails, the actual policy
  // update above has already succeeded and audit-logged, so the request
  // should still succeed rather than erroring out over a history-tracking
  // side effect.
  try {
    await recordPolicyVersion(auth.teamId, updated.version, request.rules, auth.userId ?? "system");
  } catch (err) {
    // Deliberately no rethrow -- see comment above.
    await recordAudit({
      entityType: "policy",
      entityId: auth.teamId,
      action: "version_snapshot_failed",
      actorId: "system",
      afterState: { version: updated.version, error: err instanceof Error ? err.message : String(err) },
      meta,
    });
  }

  await recordAudit({
    entityType: "policy",
    entityId: auth.teamId,
    action: "updated",
    actorId: auth.userId ?? "system",
    afterState: { version: updated.version, ruleCount: request.rules.length },
    meta,
  });

  return {
    teamId: auth.teamId,
    rules: updated.rules as never,
    version: updated.version,
    updatedAt: updated.updatedAt.toISOString(),
  };
}

/** What a policy rule's `field` is actually evaluated against for a given
 *  decision -- the small, fixed set of values available right after the
 *  agent debate, before the Decision row is even written. */
export interface PolicyEvalContext {
  verdict: string;
  confidence: number;
  prospectTitle: string | null;
}

function getFieldValue(context: PolicyEvalContext, field: PolicyRule["field"]): string | number | null {
  switch (field) {
    case "verdict":
      return context.verdict;
    case "confidence":
      return context.confidence;
    case "prospect.title":
      return context.prospectTitle;
    default:
      return null;
  }
}

function ruleMatches(rule: PolicyRule, context: PolicyEvalContext): boolean {
  const actual = getFieldValue(context, rule.field);
  if (actual === null) return false;

  switch (rule.operator) {
    case "equals":
      return String(actual) === String(rule.value);
    case "contains":
      return (
        typeof actual === "string" &&
        typeof rule.value === "string" &&
        actual.toLowerCase().includes(rule.value.toLowerCase())
      );
    case "gte":
      return typeof actual === "number" && typeof rule.value === "number" && actual >= rule.value;
    case "lte":
      return typeof actual === "number" && typeof rule.value === "number" && actual <= rule.value;
    case "in":
      return Array.isArray(rule.value) && rule.value.map(String).includes(String(actual));
    default:
      return false;
  }
}

/** Bible-adjacent (Policy v2.1, not the Bible) "Policy Check" step of the
 *  Governor Model: Decision Engine -> Policy Check -> Human Approval. Pure
 *  function -- no I/O -- so it's trivially unit-testable against every
 *  operator/action combination without a database. */
export function evaluatePolicyRules(rules: PolicyRule[], context: PolicyEvalContext): PolicyFlag[] {
  return rules
    .filter((rule) => ruleMatches(rule, context))
    .map((rule) => ({ field: rule.field, action: rule.action, message: rule.message }));
}

// v4 roadmap Phase 5 -- version history + rollback, additive to everything
// above. Same admin-only gate as updatePolicyForTeam, since both read/
// mutate governance rules.

export async function getPolicyVersionHistoryForTeam(auth: AuthContext): Promise<PolicyVersionHistoryResponse> {
  if (!auth.role || !ADMIN_ROLES.has(auth.role)) {
    throw new AppError("FORBIDDEN", "Only a team admin can view policy version history");
  }

  const versions = await getPolicyVersionHistory(auth.teamId);
  return {
    teamId: auth.teamId,
    versions: versions.map((v) => ({
      version: v.version,
      rules: v.rules as never,
      createdAt: v.createdAt.toISOString(),
      createdBy: v.createdBy,
    })),
  };
}

/** Rolling back means re-saving a historical version's rules through the
 *  existing, unchanged updatePolicyForTeam/upsertPolicy path -- it creates
 *  a NEW version number carrying the old rules content, not a literal
 *  revert to the old version number. Same as a git revert commit: the
 *  history stays linear and every version, including this one, is still
 *  snapshotted. */
export async function rollbackPolicyForTeam(
  auth: AuthContext,
  version: number,
  meta?: RequestMeta,
): Promise<PolicyResponse> {
  const target = await getPolicyVersion(auth.teamId, version);
  if (!target) {
    throw new AppError("NOT_FOUND", `Policy version ${version} does not exist for this team`);
  }

  return updatePolicyForTeam(auth, { rules: target.rules as never }, meta);
}
