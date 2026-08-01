import { AppError } from "@argus/shared";
import { shadowBucket, shouldSampleShadow } from "./shadow-sampling.js";
import {
  getRolloutConfig,
  getTeamOverride,
  upsertRolloutConfig,
  upsertTeamOverride as upsertTeamOverrideRepo,
} from "./shadow-rollout.repository.js";

// Gate 3 Increment 1.8 -- all business logic and validation for shadow
// rollout control lives here, not in admin.service.ts (which stays a thin
// DTO-shaping layer over this, matching how it already reuses
// getShadowMetricsSummary rather than reimplementing aggregation itself).

function assertValidPercent(percent: number, field: string): void {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new AppError("VALIDATION_ERROR", `${field} must be an integer between 0 and 100`);
  }
}

export interface ShadowSamplingPreview {
  enabled: boolean;
  globalPercent: number;
  override: { teamId: string; percent: number; reason: string | null; expiresAt: string | null } | null;
  effectivePercent: number;
  bucket: number;
  sampled: boolean;
}

/** Single source of truth for "what would happen for this prospect/team
 *  right now" -- both the live hot path (resolveShadowSampling) AND the
 *  Dry Run Preview admin endpoint call this, so the preview can never
 *  disagree with real behavior. An expired override is ignored here
 *  (falls back to global) but never deleted -- no cron/sweep exists in
 *  this codebase. */
export async function previewShadowSampling(prospectId: string, teamId: string): Promise<ShadowSamplingPreview> {
  const config = await getRolloutConfig();
  const rawOverride = await getTeamOverride(teamId);
  const now = new Date();
  const override = rawOverride && (!rawOverride.expiresAt || rawOverride.expiresAt > now) ? rawOverride : null;
  const enabled = config?.enabled ?? false;
  const effectivePercent = override?.percent ?? config?.globalPercent ?? 0;

  return {
    enabled,
    globalPercent: config?.globalPercent ?? 0,
    override: override
      ? {
          teamId: override.teamId,
          percent: override.percent,
          reason: override.reason,
          expiresAt: override.expiresAt?.toISOString() ?? null,
        }
      : null,
    effectivePercent,
    bucket: shadowBucket(prospectId),
    sampled: enabled && shouldSampleShadow(prospectId, effectivePercent),
  };
}

/** The hot-path gate shadow-runner.service.ts calls -- fail-closed when no
 *  config row exists yet, same default-off posture SHADOW_MODE_ENABLED
 *  already has. */
export async function resolveShadowSampling(prospectId: string, teamId: string): Promise<boolean> {
  return (await previewShadowSampling(prospectId, teamId)).sampled;
}

export async function updateRolloutConfig(input: { enabled: boolean; globalPercent: number }, updatedBy: string) {
  assertValidPercent(input.globalPercent, "globalPercent");
  const before = await getRolloutConfig();
  const after = await upsertRolloutConfig(input, updatedBy);
  return { before, after };
}

export async function upsertTeamOverride(
  teamId: string,
  input: { percent: number; reason?: string; expiresAt?: string },
  updatedBy: string,
) {
  assertValidPercent(input.percent, "percent");
  const before = await getTeamOverride(teamId);
  const after = await upsertTeamOverrideRepo(
    teamId,
    {
      percent: input.percent,
      reason: input.reason ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
    updatedBy,
  );
  return { before, after };
}
