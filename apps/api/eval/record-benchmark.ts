/**
 * Registers an already-produced eval manifest (from run.ts/run-candidate.ts/
 * run-model-routing.ts/run-execution-runtime.ts) into the local benchmark
 * registry (registry.ts). Makes no real API calls itself -- it only reads a
 * manifest file that already exists on disk and computes real aggregate
 * metrics + real version pins from it.
 *
 * Usage: npm run eval:record-benchmark --workspace=@argus/api -- <manifest-path.json>
 */
import { readFileSync } from "node:fs";
import { recordBenchmarkRun, REGISTRY_PATH, type AnyBenchmarkManifest } from "./registry.js";

function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error("Usage: eval:record-benchmark <manifest-path.json>");
    process.exitCode = 1;
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as AnyBenchmarkManifest;
  const record = recordBenchmarkRun(manifest);

  console.log(`Recorded benchmark ${record.id} (source: ${record.sourceKind}, run ${record.sourceRunId})`);
  console.log(JSON.stringify(record.metrics, null, 2));
  console.log(`\nAppended to ${REGISTRY_PATH}`);
}

main();
