/**
 * Reads the local benchmark registry (registry.ts) -- no real API calls,
 * pure local file reads.
 *
 * Usage:
 *   npm run eval:query-benchmark-registry --workspace=@argus/api -- list
 *   npm run eval:query-benchmark-registry --workspace=@argus/api -- compare <baselineId> <candidateId>
 *   npm run eval:query-benchmark-registry --workspace=@argus/api -- regressions <metricName> <dropThreshold>
 */
import { compareBenchmarkRuns, findRegressions, loadRegistry, type BenchmarkMetrics } from "./registry.js";

function listCommand() {
  const registry = loadRegistry();
  if (registry.length === 0) {
    console.log("Registry is empty -- run eval:record-benchmark against a real manifest first.");
    return;
  }
  for (const record of registry) {
    console.log(
      `${record.id}  ${record.timestamp}  ${record.sourceKind.padEnd(18)}  ` +
        `success=${(record.metrics.successRate * 100).toFixed(1)}%  ` +
        `p50=${record.metrics.latencyMsP50}ms  ` +
        `cost=${record.metrics.totalCostUsd !== null ? `$${record.metrics.totalCostUsd.toFixed(4)}` : "n/a"}  ` +
        `code=${record.codeVersion ?? "unknown"}`,
    );
  }
}

function compareCommand(baselineId: string, candidateId: string) {
  const { baseline, candidate, deltas } = compareBenchmarkRuns(baselineId, candidateId);
  console.log(`Baseline:  ${baseline.id}  (${baseline.timestamp}, ${baseline.sourceKind}, code ${baseline.codeVersion ?? "unknown"})`);
  console.log(`Candidate: ${candidate.id}  (${candidate.timestamp}, ${candidate.sourceKind}, code ${candidate.codeVersion ?? "unknown"})`);
  console.log("\nDeltas (candidate - baseline):");
  for (const [key, delta] of Object.entries(deltas)) {
    console.log(`  ${key}: ${delta! >= 0 ? "+" : ""}${delta!.toFixed(4)}`);
  }
}

function regressionsCommand(metric: string, thresholdArg: string) {
  const threshold = Number(thresholdArg);
  if (Number.isNaN(threshold)) {
    console.error(`Invalid dropThreshold: ${thresholdArg}`);
    process.exitCode = 1;
    return;
  }
  const regressions = findRegressions(metric as keyof BenchmarkMetrics, threshold);
  if (regressions.length === 0) {
    console.log(`No regressions found in "${metric}" exceeding a drop of ${threshold} across the recorded history.`);
    return;
  }
  for (const { from, to, delta } of regressions) {
    console.log(`${from.timestamp} -> ${to.timestamp}: ${metric} dropped by ${Math.abs(delta).toFixed(4)} (${from.id} -> ${to.id})`);
  }
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "list") {
    listCommand();
  } else if (command === "compare" && args.length === 2) {
    compareCommand(args[0] as string, args[1] as string);
  } else if (command === "regressions" && args.length === 2) {
    regressionsCommand(args[0] as string, args[1] as string);
  } else {
    console.error("Usage: eval:query-benchmark-registry list | compare <baselineId> <candidateId> | regressions <metric> <dropThreshold>");
    process.exitCode = 1;
  }
}

main();
