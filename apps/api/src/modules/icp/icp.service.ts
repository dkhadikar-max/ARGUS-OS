import { AppError, type IcpResponse, type UpdateIcpRequest } from "@argus/shared";
import { ADMIN_ROLES, type AuthContext } from "../../middleware/auth.js";
import { recordAudit, type RequestMeta } from "../../lib/audit.js";
import { getIcp, upsertIcp } from "./icp.repository.js";

// Criteria weights should sum to ~1 (Bible §5.2/§9.1's ICPDefinition.criteria
// shape) -- enforced here, not at the Zod schema level, since a manager
// mid-edit of the form has a transient state with duplicate/partial weights
// that's still valid to *hold in the UI*, just not to *save*. An empty
// criteria array (clearing the ICP) is exempt: there's nothing to sum.
const WEIGHT_SUM_TOLERANCE = 0.02;

function assertWeightsSumToOne(criteria: UpdateIcpRequest["criteria"]): void {
  if (criteria.length === 0) return;
  const sum = criteria.reduce((total, c) => total + c.weight, 0);
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Criteria weights must sum to 1 (currently ${sum.toFixed(2)})`,
    );
  }
}

export async function getIcpForTeam(auth: AuthContext): Promise<IcpResponse> {
  const icp = await getIcp(auth.teamId);
  if (!icp) {
    return { teamId: auth.teamId, criteria: [], version: 0, updatedAt: null };
  }
  return {
    teamId: auth.teamId,
    criteria: icp.criteria as never,
    version: icp.version,
    updatedAt: icp.updatedAt.toISOString(),
  };
}

export async function updateIcpForTeam(
  auth: AuthContext,
  request: UpdateIcpRequest,
  meta?: RequestMeta,
): Promise<IcpResponse> {
  if (!auth.role || !ADMIN_ROLES.has(auth.role)) {
    throw new AppError("FORBIDDEN", "Only a team admin can edit the ICP definition");
  }
  assertWeightsSumToOne(request.criteria);

  const updated = await upsertIcp(auth.teamId, request.criteria);

  await recordAudit({
    entityType: "icp",
    entityId: auth.teamId,
    action: "updated",
    actorId: auth.userId ?? "system",
    afterState: { version: updated.version, criteriaCount: request.criteria.length },
    meta,
  });

  return {
    teamId: auth.teamId,
    criteria: updated.criteria as never,
    version: updated.version,
    updatedAt: updated.updatedAt.toISOString(),
  };
}
