/**
 * Diffs two eval runs (from eval/run.ts) and reports what changed per
 * fixture -- verdict flips, score/confidence/latency deltas. Exits 1 if any
 * fixture's verdict changed, so this can gate a phase's "done" claim on "no
 * unexpected regressions" rather than eyeballing raw JSON.
 *
 * Usage: npm run eval:compare --workspace=@argus/api -- <baseline.json> <candidate.json>
 */
import { readFileSync } from "node:fs";
import type { EvalRunManifest, EvalRunResult } from "./types.js";

function loadManifest(path: string): EvalRunManifest {
  return JSON.parse(readFileSync(path, "utf-8")) as EvalRunManifest;
}

function byFixture(results: EvalRunResult[]): Map<string, EvalRunResult> {
  return new Map(results.map((r) => [r.fixture, r]));
}

function main() {
  const [baselinePath, candidatePath] = process.argv.slice(2);
  if (!baselinePath || !candidatePath) {
    console.error("Usage: eval:compare <baseline.json> <candidate.json>");
    process.exitCode = 1;
    return;
  }

  const baseline = loadManifest(baselinePath);
  const candidate = loadManifest(candidatePath);
  const baseResults = byFixture(baseline.results);
  const candResults = byFixture(candidate.results);

  console.log(`Baseline:  ${baseline.runId} (${baseline.model}, commit ${baseline.gitCommit ?? "unknown"})`);
  console.log(`Candidate: ${candidate.runId} (${candidate.model}, commit ${candidate.gitCommit ?? "unknown"})\n`);

  let verdictChanged = false;
  const allFixtures = new Set([...baseResults.keys(), ...candResults.keys()]);

  for (const fixture of allFixtures) {
    const base = baseResults.get(fixture);
    const cand = candResults.get(fixture);

    if (!base || !cand) {
      console.log(`  ${fixture}: MISSING in ${!base ? "baseline" : "candidate"}`);
      continue;
    }

    const verdictFlip = base.verdict !== cand.verdict;
    if (verdictFlip) verdictChanged = true;

    const scoreDelta = cand.weightedScore - base.weightedScore;
    const latencyDelta = cand.processingTimeMs - base.processingTimeMs;

    console.log(
      `  ${fixture}: ${verdictFlip ? "VERDICT CHANGED " + base.verdict + " -> " + cand.verdict : cand.verdict} | ` +
        `score ${base.weightedScore} -> ${cand.weightedScore} (${scoreDelta >= 0 ? "+" : ""}${scoreDelta}) | ` +
        `latency ${base.processingTimeMs}ms -> ${cand.processingTimeMs}ms (${latencyDelta >= 0 ? "+" : ""}${latencyDelta}ms)`,
    );
  }

  if (verdictChanged) {
    console.log("\nAt least one fixture's verdict changed -- review before treating this as a safe change.");
    process.exitCode = 1;
  } else {
    console.log("\nNo verdict changes across all fixtures.");
  }
}

main();
