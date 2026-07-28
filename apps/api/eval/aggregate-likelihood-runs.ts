/**
 * Aggregates multiple eval/runs/likelihood-harness_*.json manifests from
 * REPEATED runs of the same model/mode into a variance report (mean,
 * median, sample stddev, min, max per stage). Makes no Ollama calls itself
 * -- pure aggregation over manifests likelihood-harness.ts already wrote.
 *
 * Motivated by a real finding (2026-07-28): two 15-fixture runs of the same
 * model, same fixtures, same repair logic produced 26.7% and 60.0%
 * schema-valid-after-repair -- a >2x spread from LLM sampling stochasticity
 * alone (Ollama defaults, no fixed seed/temperature=0). A single run is not
 * a stable point estimate; repeatability is a property of the inference
 * system, not any one run's score, and belongs alongside accuracy as a
 * first-class benchmark output.
 *
 * Refuses to aggregate across different models or modes (raw vs --repair
 * answer different questions -- see likelihood-harness.ts's own module
 * comment) rather than silently averaging incompatible numbers into a
 * meaningless one.
 *
 * Usage:
 *   npx tsx eval/aggregate-likelihood-runs.ts <manifest1.json> <manifest2.json> ...
 *   npx tsx eval/aggregate-likelihood-runs.ts --model=llama3.2:3b --mode=repair
 *     (auto-discovers every matching manifest already in eval/runs/)
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { StageId, LikelihoodHarnessManifest } from "./likelihood-harness.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = join(__dirname, "runs");

interface DistributionStats {
  /** The per-run raw values this distribution was computed from, kept for
   *  transparency -- a mean/stddev without the underlying samples invites
   *  exactly the "quoting one number as the result" mistake this script
   *  exists to prevent. */
  values: number[];
  mean: number;
  median: number;
  /** Sample stddev (n-1 denominator). Null when n<2 -- honestly undefined,
   *  not silently reported as 0. */
  stddev: number | null;
  min: number;
  max: number;
  n: number;
}

interface StageVariance {
  stage: StageId;
  runCount: number;
  schemaValidAfterRepairRate: DistributionStats;
  schemaValidBeforeRepairRate: DistributionStats;
  /** null when mode is raw -- toolCallProduced isn't tracked there (see
   *  likelihood-harness.ts's own module comment). */
  toolCallRate: DistributionStats | null;
  avgLatencyMs: DistributionStats;
}

function stats(values: number[]): DistributionStats {
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const mid = Math.floor(n / 2);
  const median = n % 2 === 0 ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2 : (sorted[mid] as number);
  const stddev = n < 2 ? null : Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1));
  return { values, mean, median, stddev, min: sorted[0] as number, max: sorted[n - 1] as number, n };
}

/** Older likelihood-harness manifests (pre-2026-07-27 instrumentation
 *  rewrite) don't have toolCallProduced/attempts fields at all -- `in`
 *  checks the key's actual presence, not just a falsy/undefined value, so a
 *  pre-rewrite manifest is correctly treated as "not measured" rather than
 *  silently counted as a 0% tool-call rate. */
function hasToolCallField(manifest: LikelihoodHarnessManifest): boolean {
  return manifest.results.length > 0 && "toolCallProduced" in (manifest.results[0] as object);
}

function perStageRates(manifest: LikelihoodHarnessManifest, stage: StageId) {
  const stageResults = manifest.results.filter((r) => r.stage === stage);
  const total = stageResults.length;
  const validAfterRepair = stageResults.filter((r) => r.schemaValid).length;
  const validBeforeRepair = stageResults.filter((r) => r.schemaValid && !r.wasRepaired).length;
  const toolCalls = stageResults.filter((r) => r.toolCallProduced === true).length;
  const avgLatencyMs = total ? stageResults.reduce((sum, r) => sum + r.processingTimeMs, 0) / total : 0;
  return {
    schemaValidAfterRepairRate: total ? validAfterRepair / total : 0,
    schemaValidBeforeRepairRate: total ? validBeforeRepair / total : 0,
    toolCallRate: manifest.mode === "repair" && hasToolCallField(manifest) ? (total ? toolCalls / total : 0) : null,
    avgLatencyMs,
  };
}

function aggregate(manifests: LikelihoodHarnessManifest[]): StageVariance[] {
  const stagesPresent = new Set<StageId>();
  for (const m of manifests) for (const r of m.results) stagesPresent.add(r.stage);

  return Array.from(stagesPresent).map((stage) => {
    const perRun = manifests.map((m) => perStageRates(m, stage));
    const toolCallValues = perRun.filter((r) => r.toolCallRate !== null).map((r) => r.toolCallRate as number);
    return {
      stage,
      runCount: perRun.length,
      schemaValidAfterRepairRate: stats(perRun.map((r) => r.schemaValidAfterRepairRate)),
      schemaValidBeforeRepairRate: stats(perRun.map((r) => r.schemaValidBeforeRepairRate)),
      toolCallRate: toolCallValues.length ? stats(toolCallValues) : null,
      avgLatencyMs: stats(perRun.map((r) => r.avgLatencyMs)),
    };
  });
}

function discoverManifests(model: string, mode: "raw" | "repair"): string[] {
  return readdirSync(RUNS_DIR)
    .filter((f) => f.startsWith("likelihood-harness_") && f.endsWith(".json"))
    .map((f) => join(RUNS_DIR, f))
    .filter((p) => {
      const m = JSON.parse(readFileSync(p, "utf-8")) as LikelihoodHarnessManifest;
      return m.ollamaModel === model && m.mode === mode;
    });
}

function parseArgs(): { model: string | null; mode: "raw" | "repair" | null; files: string[] } {
  const modelArg = process.argv.find((a) => a.startsWith("--model="))?.split("=")[1] ?? null;
  const modeArg = process.argv.find((a) => a.startsWith("--mode="))?.split("=")[1] ?? null;
  const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (modeArg && modeArg !== "raw" && modeArg !== "repair") {
    throw new Error("Usage: --model=<name> --mode=raw|repair, or pass explicit manifest file paths");
  }
  return { model: modelArg, mode: (modeArg as "raw" | "repair" | null), files };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

async function main() {
  const { model, mode, files } = parseArgs();
  let paths = files;
  if (paths.length === 0) {
    if (!model || !mode) throw new Error("Usage: --model=<name> --mode=raw|repair, or pass explicit manifest file paths");
    paths = discoverManifests(model, mode);
  }
  if (paths.length < 1) throw new Error("No manifests found or provided.");

  const manifests = paths.map((p) => JSON.parse(readFileSync(p, "utf-8")) as LikelihoodHarnessManifest);

  const models = new Set(manifests.map((m) => m.ollamaModel));
  const modes = new Set(manifests.map((m) => m.mode));
  if (models.size > 1) throw new Error(`Refusing to aggregate across different models: ${[...models].join(", ")}`);
  if (modes.size > 1) throw new Error(`Refusing to aggregate across different modes: ${[...modes].join(", ")}`);

  // A 1-fixture smoke test and a 15-fixture run are not comparable samples
  // of the same distribution -- --model/--mode auto-discovery would
  // otherwise silently pool every past pilot together and understate real
  // variance with noise from tiny-N runs. Pass explicit file paths to
  // aggregate a deliberately mixed set if that's ever actually wanted.
  const fixtureCounts = new Set(manifests.map((m) => m.fixtureCount));
  if (fixtureCounts.size > 1) {
    throw new Error(
      `Refusing to aggregate runs of different sizes as if they were repeated samples of the same benchmark: ${[...fixtureCounts].join(", ")} fixtures. Pass explicit file paths to select a matching set.`,
    );
  }

  // A warning, not a refusal: per-field checks below (hasToolCallField) are
  // what actually protect each metric's correctness field-by-field. A
  // schemaVersion mismatch is a signal for a human to double check, not
  // proof the aggregation itself is wrong -- two of the real manifests this
  // script was built against predate the field entirely (schemaVersion
  // undefined = "unknown/pre-versioning"), and hard-refusing would make
  // them permanently unusable for historical comparison.
  const schemaVersions = new Set(manifests.map((m) => m.schemaVersion ?? "unversioned"));
  if (schemaVersions.size > 1) {
    console.warn(
      `Warning: aggregating manifests with different schemaVersion values (${[...schemaVersions].join(", ")}). ` +
        `Field-level checks (e.g. hasToolCallField) still apply per metric, but double check the manifests are actually comparable.`,
    );
  }

  const resolvedModel = [...models][0] as string;
  const resolvedMode = [...modes][0] as "raw" | "repair";
  const variance = aggregate(manifests);

  console.log(`Aggregating ${manifests.length} run(s) of ${resolvedModel} (${resolvedMode} mode)\n`);
  for (const v of variance) {
    console.log(`Stage: ${v.stage} (n=${v.runCount})`);
    console.log(
      `  schema-valid after repair:  mean=${pct(v.schemaValidAfterRepairRate.mean)} median=${pct(v.schemaValidAfterRepairRate.median)} ` +
        `stddev=${v.schemaValidAfterRepairRate.stddev === null ? "n/a (n<2)" : pct(v.schemaValidAfterRepairRate.stddev)} ` +
        `range=[${pct(v.schemaValidAfterRepairRate.min)}, ${pct(v.schemaValidAfterRepairRate.max)}]`,
    );
    console.log(
      `  schema-valid before repair: mean=${pct(v.schemaValidBeforeRepairRate.mean)} ` +
        `range=[${pct(v.schemaValidBeforeRepairRate.min)}, ${pct(v.schemaValidBeforeRepairRate.max)}]`,
    );
    if (v.toolCallRate) {
      console.log(`  tool call rate:              mean=${pct(v.toolCallRate.mean)} range=[${pct(v.toolCallRate.min)}, ${pct(v.toolCallRate.max)}]`);
    }
    console.log(
      `  avg latency:                 mean=${(v.avgLatencyMs.mean / 1000).toFixed(1)}s range=[${(v.avgLatencyMs.min / 1000).toFixed(1)}s, ${(v.avgLatencyMs.max / 1000).toFixed(1)}s]\n`,
    );
  }

  const outPath = join(
    RUNS_DIR,
    `likelihood-harness-variance_${resolvedModel.replace(/[:/]/g, "-")}_${resolvedMode}_${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(
    outPath,
    JSON.stringify({ model: resolvedModel, mode: resolvedMode, sourceManifests: paths.map((p) => basename(p)), variance }, null, 2),
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
