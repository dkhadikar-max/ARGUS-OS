/**
 * Immutable, append-only benchmark registry (Action C of the post-8-bugs
 * plan). Deliberately NOT a new Postgres table: benchmark run metadata is
 * engineering/ops data, not product data, and belongs outside the
 * production schema -- this reuses eval/runs/ (already the established,
 * gitignored convention for benchmark artifacts) rather than mixing
 * internal tooling state into Decision/Team/User. Deliberately NOT S3:
 * nothing in this project has S3 configured; raw manifests already live
 * locally in eval/runs/*.json (the run-*.ts scripts' own existing output),
 * so this just indexes them, it doesn't duplicate or re-host them.
 *
 * Also deliberately narrower than "researchAccuracy/icpAccuracy/..." per
 * stage: no real ground truth exists to score individual stage correctness
 * against (synthetic fixtures have no logged outcomes), so this only
 * aggregates fields the real eval manifests actually produce -- success
 * rate, latency, cost, confidence, calibration. Fabricating per-stage
 * accuracy numbers with nothing behind them would be exactly the kind of
 * claim the rest of this session has refused to make.
 *
 * "Immutable, append-only": records are written with appendFileSync to a
 * JSON Lines file (one record per line) -- appending a line is the natural
 * immutable operation for this format, no read-modify-write, no risk of a
 * concurrent run clobbering an earlier one's record.
 */
import { execSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { CLAUDE_MODEL } from "../src/agents/claude-client.js";
import { DEFAULT_CONTROLLER_POLICY } from "../src/agents/controller.js";
import { percentile } from "./metrics.js";
import type {
  CandidateRunManifest,
  CandidateRunResult,
  EvalRunManifest,
  EvalRunResult,
  ExecutionRuntimeRunManifest,
  ExecutionRuntimeRunResult,
  ModelRoutingRunManifest,
  ModelRoutingRunResult,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REGISTRY_PATH = join(__dirname, "runs", "registry.jsonl");

export type AnyBenchmarkManifest = CandidateRunManifest | ModelRoutingRunManifest | ExecutionRuntimeRunManifest | EvalRunManifest;
type AnyBenchmarkResult = CandidateRunResult | ModelRoutingRunResult | ExecutionRuntimeRunResult | EvalRunResult;

export type BenchmarkSourceKind = "pipeline-candidate" | "model-routing" | "execution-runtime" | "eval-run";

export interface BenchmarkMetrics {
  fixtureCount: number;
  errorCount: number;
  successRate: number;
  avgConfidence: number;
  avgWeightedScore: number;
  latencyMsP50: number;
  latencyMsP95: number;
  avgLatencyMs: number;
  /** null when the source manifest never tracked cost (a plain
   *  EvalRunManifest, from eval/run.ts, has no inferenceCostUsd field) --
   *  not 0, which would falsely claim a real zero-cost measurement. */
  totalCostUsd: number | null;
  avgCostUsd: number | null;
  totalTokens: number | null;
  /** null when the source manifest never tracked confidence calibration
   *  (plain EvalRunManifest and ModelRoutingRunManifest don't). */
  calibrationHeldRate: number | null;
}

export interface BenchmarkRecord {
  id: string;
  timestamp: string;
  /** The underlying manifest's own runId (e.g. "pipeline_2026-...") --
   *  traces this record back to the real eval/runs/*.json file it was
   *  computed from. */
  sourceRunId: string;
  sourceKind: BenchmarkSourceKind;
  /** Real: the last commit that actually touched eval/fixtures/. Null only
   *  if that git command itself fails (e.g. run outside a git checkout). */
  fixtureVersion: string | null;
  /** Real: the last commit that actually touched prompts.ts. */
  promptVersion: string | null;
  codeVersion: string | null;
  modelVersion: string;
  /** Real, already-versioned field this codebase already maintains
   *  (controller.ts's DEFAULT_CONTROLLER_POLICY.version) -- not a
   *  git-hash of a "policies/" directory that doesn't exist in this repo. */
  controllerPolicyVersion: number;
  metrics: BenchmarkMetrics;
}

function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

// Memoized per process: the real git state (which commit last touched
// fixtures/prompts.ts, what HEAD is) cannot change mid-process, so
// re-shelling out to `git log`/`git rev-parse` on every recordBenchmarkRun
// call is real, avoidable overhead (a process spawn is genuinely slow on
// Windows) -- not just a test-speed concern, this is the actual cost of a
// caller recording many manifests in one script run.
const gitLastCommitCache = new Map<string, string | null>();

function gitLastCommitTouching(pathFromEvalDir: string): string | null {
  if (gitLastCommitCache.has(pathFromEvalDir)) return gitLastCommitCache.get(pathFromEvalDir) as string | null;
  let hash: string | null;
  try {
    hash = execSync(`git log -1 --format=%h -- "${pathFromEvalDir}"`, { cwd: __dirname }).toString().trim() || null;
  } catch {
    hash = null;
  }
  gitLastCommitCache.set(pathFromEvalDir, hash);
  return hash;
}

let currentGitCommitCache: string | null | undefined;

function currentGitCommit(): string | null {
  if (currentGitCommitCache !== undefined) return currentGitCommitCache;
  try {
    currentGitCommitCache = execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim();
  } catch {
    currentGitCommitCache = null;
  }
  return currentGitCommitCache;
}

function detectSourceKind(manifest: AnyBenchmarkManifest): BenchmarkSourceKind {
  if ("candidate" in manifest) return "pipeline-candidate";
  if ("agentOverrides" in manifest) return "model-routing";
  if (manifest.results.some((r) => "controllerAction" in r)) return "execution-runtime";
  return "eval-run";
}

function hasField<K extends string>(result: AnyBenchmarkResult, key: K): result is AnyBenchmarkResult & Record<K, unknown> {
  return key in result;
}

/**
 * Computes real aggregate metrics from an already-produced manifest (any
 * of run.ts/run-candidate.ts/run-model-routing.ts/run-execution-runtime.ts's
 * own output) and appends an immutable BenchmarkRecord to the registry.
 * Never re-runs anything itself -- the run-*.ts scripts already own real
 * fixture execution; this only indexes what they already produced.
 */
export function recordBenchmarkRun(manifest: AnyBenchmarkManifest, registryPath: string = REGISTRY_PATH): BenchmarkRecord {
  const ok = manifest.results.filter((r) => !r.error);
  const first = ok[0];

  const hasCost = first !== undefined && hasField(first, "inferenceCostUsd");
  const costs = hasCost ? (ok as Array<CandidateRunResult | ModelRoutingRunResult | ExecutionRuntimeRunResult>).map((r) => r.inferenceCostUsd) : [];

  const hasTokens = first !== undefined && hasField(first, "inputTokens");
  const totalTokens = hasTokens
    ? (ok as Array<CandidateRunResult | ModelRoutingRunResult | ExecutionRuntimeRunResult>).reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0)
    : null;

  const hasCalibration = first !== undefined && hasField(first, "confidenceCalibration");
  const calibrationHeld = hasCalibration
    ? (ok as Array<CandidateRunResult | ExecutionRuntimeRunResult>).filter((r) => r.confidenceCalibration.ruleHeld).length
    : null;

  const latencies = ok.map((r) => r.processingTimeMs);

  const metrics: BenchmarkMetrics = {
    fixtureCount: manifest.results.length,
    errorCount: manifest.results.length - ok.length,
    successRate: manifest.results.length ? ok.length / manifest.results.length : 0,
    avgConfidence: average(ok.map((r) => r.confidence)),
    avgWeightedScore: average(ok.map((r) => r.weightedScore)),
    latencyMsP50: percentile(latencies, 50),
    latencyMsP95: percentile(latencies, 95),
    avgLatencyMs: average(latencies),
    totalCostUsd: hasCost ? costs.reduce((a, b) => a + b, 0) : null,
    avgCostUsd: hasCost ? average(costs) : null,
    totalTokens,
    calibrationHeldRate: hasCalibration && ok.length > 0 ? (calibrationHeld as number) / ok.length : null,
  };

  const record: BenchmarkRecord = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    sourceRunId: manifest.runId,
    sourceKind: detectSourceKind(manifest),
    fixtureVersion: gitLastCommitTouching("fixtures"),
    promptVersion: gitLastCommitTouching("../src/agents/prompts.ts"),
    codeVersion: manifest.gitCommit ?? currentGitCommit(),
    modelVersion: "model" in manifest ? manifest.model : CLAUDE_MODEL,
    controllerPolicyVersion: DEFAULT_CONTROLLER_POLICY.version,
    metrics,
  };

  mkdirSync(dirname(registryPath), { recursive: true });
  appendFileSync(registryPath, JSON.stringify(record) + "\n");
  return record;
}

export function loadRegistry(registryPath: string = REGISTRY_PATH): BenchmarkRecord[] {
  if (!existsSync(registryPath)) return [];
  return readFileSync(registryPath, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as BenchmarkRecord);
}

export interface BenchmarkDelta {
  baseline: BenchmarkRecord;
  candidate: BenchmarkRecord;
  deltas: Partial<Record<keyof BenchmarkMetrics, number>>;
}

/** Real numeric deltas (candidate - baseline) for every metric both
 *  records actually have a number for -- a metric that's null on either
 *  side (e.g. cost, on an EvalRunManifest-sourced record) is simply
 *  omitted from deltas, not defaulted to 0. */
export function compareBenchmarkRuns(baselineId: string, candidateId: string, registryPath: string = REGISTRY_PATH): BenchmarkDelta {
  const registry = loadRegistry(registryPath);
  const baseline = registry.find((r) => r.id === baselineId);
  const candidate = registry.find((r) => r.id === candidateId);
  if (!baseline) throw new Error(`No benchmark record with id ${baselineId}`);
  if (!candidate) throw new Error(`No benchmark record with id ${candidateId}`);

  const deltas: BenchmarkDelta["deltas"] = {};
  for (const key of Object.keys(baseline.metrics) as Array<keyof BenchmarkMetrics>) {
    const b = baseline.metrics[key];
    const c = candidate.metrics[key];
    if (typeof b === "number" && typeof c === "number") {
      deltas[key] = c - b;
    }
  }
  return { baseline, candidate, deltas };
}

export interface BenchmarkRegression {
  from: BenchmarkRecord;
  to: BenchmarkRecord;
  delta: number;
}

/** Consecutive-pair comparison across the registry's real chronological
 *  history (sorted by timestamp) -- "when did X drop by more than
 *  threshold" is answered by walking real recorded history, not a
 *  synthetic trend line. */
export function findRegressions(metric: keyof BenchmarkMetrics, dropThreshold: number, registryPath: string = REGISTRY_PATH): BenchmarkRegression[] {
  const registry = loadRegistry(registryPath).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const regressions: BenchmarkRegression[] = [];

  for (let i = 1; i < registry.length; i += 1) {
    const prev = registry[i - 1] as BenchmarkRecord;
    const curr = registry[i] as BenchmarkRecord;
    const prevValue = prev.metrics[metric];
    const currValue = curr.metrics[metric];
    if (typeof prevValue === "number" && typeof currValue === "number") {
      const delta = currValue - prevValue;
      if (delta < -Math.abs(dropThreshold)) {
        regressions.push({ from: prev, to: curr, delta });
      }
    }
  }

  return regressions;
}
