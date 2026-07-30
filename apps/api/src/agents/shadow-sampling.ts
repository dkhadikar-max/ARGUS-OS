import { createHash } from "node:crypto";

/**
 * Gate 3 Shadow Mode, Increment 1 -- deterministic 0-99 bucket assignment
 * for a prospect. Deliberately NOT Math.random(): a shadow decision has to
 * be reproducibly testable (a fixed prospectId always lands in the same
 * bucket), and a stable per-prospect assignment matters for future
 * outcome-correlation work (Increment 2+), which needs the same prospect
 * consistently in or out of the shadow cohort across repeat decisions.
 *
 * Buckets on prospectId, not teamId -- team-level bucketing would put an
 * entire team permanently in or out at any rate below 100%, a much coarser
 * and more biased sample than a percentage dial implies.
 */
export function shadowBucket(prospectId: string): number {
  const hash = createHash("sha256").update(prospectId).digest();
  return hash.readUInt32BE(0) % 100;
}

export function shouldSampleShadow(prospectId: string, samplePercent: number): boolean {
  if (samplePercent <= 0) return false;
  if (samplePercent >= 100) return true;
  return shadowBucket(prospectId) < samplePercent;
}
