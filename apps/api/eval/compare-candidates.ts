/**
 * v4 roadmap Phase 9 -- cross-candidate comparison for the 3-candidate
 * architecture benchmark (pipeline vs single-call vs pipeline-with-conflict).
 * Unlike compare.ts (which diffs two runs of the SAME candidate to catch
 * regressions), this takes 2-3 CandidateRunManifests of DIFFERENT candidates
 * covering the same fixture set and reports the metrics the user asked for:
 * latency p50/p95, cost, verdict agreement, confidence calibration, evidence
 * utilization, conflict usefulness, Decision Value per Dollar.
 *
 * Judge stability (repeatability) is NOT computed here -- it requires
 * re-running the Judge stage N times per fixture, which is a separate
 * Phase B harness, not a diff across single-run manifests.
 *
 * Usage: npm run eval:compare-candidates --workspace=@argus/api -- <manifest1.json> <manifest2.json> [manifest3.json]
 */
import { readFileSync } from "node:fs";
import { percentile } from "./metrics.js";
import type { CandidateRunManifest, CandidateRunResult } from "./types.js";

function loadManifest(path: string): CandidateRunManifest {
  return JSON.parse(readFileSync(path, "utf-8")) as CandidateRunManifest;
}

function byFixture(results: CandidateRunResult[]): Map<string, CandidateRunResult> {
  return new Map(results.map((r) => [r.fixture, r]));
}

function summarizeCandidate(manifest: CandidateRunManifest): void {
  const ok = manifest.results.filter((r) => !r.error);
  const errored = manifest.results.length - ok.length;
  const latencies = ok.map((r) => r.processingTimeMs);
  const totalCostUsd = ok.reduce((sum, r) => sum + r.inferenceCostUsd, 0);
  const totalValueUsd = ok.reduce((sum, r) => sum + r.decisionValueUsd, 0);
  const ratios = ok.map((r) => r.valueCostRatio).filter((v): v is number => v !== null);
  const evidenceRates = ok.map((r) => r.evidenceUtilizationRate).filter((v): v is number => v !== null);
  const calibrationHeld = ok.filter((r) => r.confidenceCalibration.ruleHeld).length;
  const calibrationConsidered = ok.filter((r) => r.confidenceCalibration.consideredSparse).length;

  console.log(`\n=== ${manifest.candidate} === (${manifest.runId}, ${manifest.model}, commit ${manifest.gitCommit ?? "unknown"})`);
  console.log(`  Fixtures: ${manifest.results.length} (${errored} errored)`);
  console.log(`  Latency:  p50=${percentile(latencies, 50)}ms  p95=${percentile(latencies, 95)}ms`);
  console.log(`  Cost:     total=$${totalCostUsd.toFixed(4)}  avg=$${(totalCostUsd / (ok.length || 1)).toFixed(4)}/fixture`);
  console.log(
    `  Decision Value/$ (no-outcome proxy): total value=$${totalValueUsd.toFixed(2)}  ` +
      `avg ratio=${ratios.length ? (ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(1) : "n/a"}`,
  );
  console.log(
    `  Evidence utilization (proxy): avg=${evidenceRates.length ? ((evidenceRates.reduce((a, b) => a + b, 0) / evidenceRates.length) * 100).toFixed(0) + "%" : "n/a"}`,
  );
  console.log(
    `  Confidence calibration (proxy): rule held ${calibrationHeld}/${ok.length} ` +
      `(${calibrationConsidered} fixtures flagged sparse)`,
  );
}

function compareVerdictAgreement(manifests: CandidateRunManifest[]): void {
  if (manifests.length < 2) return;
  const [first, ...rest] = manifests;
  const firstResults = byFixture(first!.results);
  const restResults = rest.map((m) => ({ candidate: m.candidate, results: byFixture(m.results) }));

  console.log(`\n=== Verdict agreement (vs ${first!.candidate}) ===`);
  for (const { candidate, results } of restResults) {
    let agree = 0;
    let compared = 0;
    const flips: string[] = [];
    for (const [fixture, baseResult] of firstResults) {
      const candResult = results.get(fixture);
      if (!candResult || baseResult.error || candResult.error) continue;
      compared++;
      if (baseResult.verdict === candResult.verdict) agree++;
      else flips.push(`${fixture}: ${baseResult.verdict} -> ${candResult.verdict}`);
    }
    console.log(`  ${candidate}: ${agree}/${compared} agree (${compared ? ((agree / compared) * 100).toFixed(0) : "n/a"}%)`);
    for (const flip of flips) console.log(`    - ${flip}`);
  }
}

/** Conflict usefulness: for pipeline-with-conflict, did the deterministic
 *  conflict signal actually change the verdict vs the plain pipeline run on
 *  the same fixture? Only meaningful when both a "pipeline" and a
 *  "pipeline-with-conflict" manifest are present. */
function compareConflictUsefulness(manifests: CandidateRunManifest[]): void {
  const pipeline = manifests.find((m) => m.candidate === "pipeline");
  const withConflict = manifests.find((m) => m.candidate === "pipeline-with-conflict");
  if (!pipeline || !withConflict) return;

  const pipelineResults = byFixture(pipeline.results);
  let changed = 0;
  let compared = 0;
  const changes: string[] = [];

  for (const conflictResult of withConflict.results) {
    const baseResult = pipelineResults.get(conflictResult.fixture);
    if (!baseResult || baseResult.error || conflictResult.error) continue;
    compared++;
    if (baseResult.verdict !== conflictResult.verdict) {
      changed++;
      changes.push(
        `${conflictResult.fixture}: ${baseResult.verdict} -> ${conflictResult.verdict} ` +
          `(conflict cv=${conflictResult.conflict?.cv.toFixed(2) ?? "n/a"}, directional=${conflictResult.conflict?.directional ?? "n/a"})`,
      );
    }
  }

  console.log(`\n=== Conflict usefulness (pipeline vs pipeline-with-conflict) ===`);
  console.log(`  Verdict changed by conflict signal: ${changed}/${compared} fixtures`);
  for (const change of changes) console.log(`    - ${change}`);
}

function main() {
  const paths = process.argv.slice(2);
  if (paths.length < 2) {
    console.error("Usage: eval:compare-candidates <manifest1.json> <manifest2.json> [manifest3.json]");
    process.exitCode = 1;
    return;
  }

  const manifests = paths.map(loadManifest);
  for (const manifest of manifests) summarizeCandidate(manifest);
  compareVerdictAgreement(manifests);
  compareConflictUsefulness(manifests);
}

main();
