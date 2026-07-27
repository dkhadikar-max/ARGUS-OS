/**
 * Execution Runtime v1 (docs/ARCHITECTURE_V4.md) -- compares a legacy
 * "pipeline" CandidateRunManifest (baseline: `npm run eval:run-candidate --
 * --candidate=pipeline`) against an ExecutionRuntimeRunManifest (`npm run
 * eval:run-execution-runtime`), matched by fixture name so the two runs
 * don't need identical fixture sets, counts, or ordering -- same pattern as
 * compare-model-routing.ts.
 *
 * This answers the question the Controller & Capability Spec v3.0 work
 * raised but couldn't answer on its own: does the controller-driven runtime
 * produce measurably different (ideally better) decisions than the fixed
 * pipeline, not just "does it execute."
 *
 * NOT measured here, honestly: retry counts (callAgent's own MAX_ATTEMPTS
 * retry loop isn't captured in either manifest today -- only logged, not
 * returned) and true outcome quality (no real ground truth exists for
 * synthetic fixtures -- see metrics.ts's own module comment on Decision
 * Value/evidence utilization/confidence calibration all being documented
 * proxies, not the metric they're named after).
 *
 * Usage: npm run eval:compare-execution-runtime --workspace=@argus/api -- <baseline-pipeline-manifest.json> <execution-runtime-manifest.json>
 */
import { readFileSync } from "node:fs";
import { percentile } from "./metrics.js";
import type { CandidateRunManifest, CandidateRunResult, ExecutionRuntimeRunManifest } from "./types.js";

function loadBaseline(path: string): CandidateRunManifest {
  return JSON.parse(readFileSync(path, "utf-8")) as CandidateRunManifest;
}
function loadExecutionRuntime(path: string): ExecutionRuntimeRunManifest {
  return JSON.parse(readFileSync(path, "utf-8")) as ExecutionRuntimeRunManifest;
}

function summarize(label: string, ok: Array<{ processingTimeMs: number; inferenceCostUsd: number }>, total: number): void {
  const latencies = ok.map((r) => r.processingTimeMs);
  const totalCost = ok.reduce((sum, r) => sum + r.inferenceCostUsd, 0);
  console.log(`\n=== ${label} ===`);
  console.log(`  Fixtures:      ${total} (${total - ok.length} errored)`);
  console.log(`  Success rate:  ${ok.length}/${total} = ${total ? ((ok.length / total) * 100).toFixed(1) : "n/a"}%`);
  console.log(`  Latency:       p50=${percentile(latencies, 50)}ms  p95=${percentile(latencies, 95)}ms`);
  console.log(`  Cost:          total=$${totalCost.toFixed(4)}  avg=$${(totalCost / (ok.length || 1)).toFixed(4)}/fixture`);
}

function calibrationRate(ok: Array<{ confidenceCalibration: { ruleHeld: boolean } }>): string {
  const held = ok.filter((r) => r.confidenceCalibration.ruleHeld).length;
  return `${held}/${ok.length} (${ok.length ? ((held / ok.length) * 100).toFixed(0) : "n/a"}%)`;
}

function main() {
  const [baselinePath, runtimePath] = process.argv.slice(2);
  if (!baselinePath || !runtimePath) {
    console.error("Usage: eval:compare-execution-runtime <baseline-pipeline-manifest.json> <execution-runtime-manifest.json>");
    process.exitCode = 1;
    return;
  }

  const baseline = loadBaseline(baselinePath);
  const runtime = loadExecutionRuntime(runtimePath);

  const baselineOk = baseline.results.filter((r) => !r.error);
  const runtimeOk = runtime.results.filter((r) => !r.error);

  summarize(`Legacy pipeline (${baseline.runId})`, baselineOk, baseline.results.length);
  summarize(`Execution Runtime v1 (${runtime.runId})`, runtimeOk, runtime.results.length);

  console.log(`\n=== Confidence calibration (proxy: Judge §8.7's own sparse-data rule) ===`);
  console.log(`  Legacy pipeline:      rule held ${calibrationRate(baselineOk)}`);
  console.log(`  Execution Runtime v1: rule held ${calibrationRate(runtimeOk)}`);

  const baselineByFixture = new Map<string, CandidateRunResult>(baselineOk.map((r) => [r.fixture, r]));

  console.log(`\n=== Verdict agreement (Execution Runtime v1 vs legacy pipeline) ===`);
  let compared = 0;
  let agree = 0;
  const flips: string[] = [];
  for (const r of runtimeOk) {
    const base = baselineByFixture.get(r.fixture);
    if (!base) continue;
    compared++;
    if (base.verdict === r.verdict) agree++;
    else flips.push(`${r.fixture}: legacy=${base.verdict} -> runtime=${r.verdict}`);
  }
  console.log(`  Agree: ${agree}/${compared} = ${compared ? ((agree / compared) * 100).toFixed(1) : "n/a"}%`);
  for (const flip of flips) console.log(`    - ${flip}`);

  console.log(`\n=== Controller activity (Execution Runtime v1) ===`);
  const actionCounts = new Map<string, number>();
  for (const r of runtimeOk) actionCounts.set(r.controllerAction, (actionCounts.get(r.controllerAction) ?? 0) + 1);
  for (const [action, count] of actionCounts) console.log(`  ${action}: ${count}/${runtimeOk.length}`);
  const invoked = runtimeOk.filter((r) => r.extraCapabilityInvocations > 0);
  console.log(`  Extra capability invocations: ${invoked.length}/${runtimeOk.length} fixtures`);

  console.log(`\n=== Invocation usefulness (only fixtures where the Controller actually invoked an extra capability) ===`);
  console.log(`  Associational only -- baseline and Execution Runtime v1 are separate real API calls, so any`);
  console.log(`  verdict difference reflects both the invocation AND ordinary LLM sampling variance, not an`);
  console.log(`  isolated causal effect (that would need a same-run counterfactual Judge call, not built in Phase 1).`);
  if (invoked.length === 0) {
    console.log(`  No fixture triggered invoke_capability in this run -- nothing to report.`);
  } else {
    let invocationCompared = 0;
    let invocationChanged = 0;
    const changes: string[] = [];
    for (const r of invoked) {
      const base = baselineByFixture.get(r.fixture);
      if (!base) continue;
      invocationCompared++;
      if (base.verdict !== r.verdict) {
        invocationChanged++;
        changes.push(
          `${r.fixture}: legacy=${base.verdict} -> runtime=${r.verdict} ` +
            `(invoked ${r.controllerTargetCapability ?? "?"}; ${r.controllerReasons.join("; ")})`,
        );
      }
    }
    console.log(`  Verdict changed: ${invocationChanged}/${invocationCompared} fixtures`);
    for (const change of changes) console.log(`    - ${change}`);
  }

  const runtimeErrored = runtime.results.length - runtimeOk.length;
  const baselineErrored = baseline.results.length - baselineOk.length;
  if (runtimeErrored !== baselineErrored) {
    console.log(
      `\nNote: error counts differ (legacy ${baselineErrored} vs runtime ${runtimeErrored}) -- an extra real LLM call ` +
        `per invoke_capability fixture is an extra chance for a transient failure, worth checking before drawing conclusions.`,
    );
  }
}

main();
