/**
 * v4 roadmap Phase 14 -- compares a model-routing run (one agent stage
 * overridden to a cheaper model) against an existing "pipeline" baseline
 * CandidateRunManifest (Phase 9), matched by fixture name so the two runs
 * don't need identical fixture sets, counts, or ordering.
 *
 * Usage: npm run eval:compare-model-routing --workspace=@argus/api -- <baseline-pipeline-manifest.json> <model-routing-manifest.json>
 */
import { readFileSync } from "node:fs";
import { percentile } from "./metrics.js";
import type { CandidateRunManifest, ModelRoutingRunManifest } from "./types.js";

function main() {
  const [baselinePath, routingPath] = process.argv.slice(2);
  if (!baselinePath || !routingPath) {
    console.error("Usage: eval:compare-model-routing <baseline-pipeline-manifest.json> <model-routing-manifest.json>");
    process.exitCode = 1;
    return;
  }

  const baseline = JSON.parse(readFileSync(baselinePath, "utf-8")) as CandidateRunManifest;
  const routing = JSON.parse(readFileSync(routingPath, "utf-8")) as ModelRoutingRunManifest;

  const baselineByFixture = new Map(baseline.results.filter((r) => !r.error).map((r) => [r.fixture, r]));

  let compared = 0;
  let agree = 0;
  const flips: string[] = [];
  let baselineCost = 0;
  let routingCost = 0;
  const baselineLatencies: number[] = [];
  const routingLatencies: number[] = [];

  for (const routingResult of routing.results) {
    if (routingResult.error) continue;
    const base = baselineByFixture.get(routingResult.fixture);
    if (!base) continue;
    compared++;
    baselineCost += base.inferenceCostUsd;
    routingCost += routingResult.inferenceCostUsd;
    baselineLatencies.push(base.processingTimeMs);
    routingLatencies.push(routingResult.processingTimeMs);
    if (base.verdict === routingResult.verdict) agree++;
    else flips.push(`${routingResult.fixture}: baseline=${base.verdict} routed=${routingResult.verdict}`);
  }

  console.log(`Agent override: ${JSON.stringify(routing.agentOverrides)}`);
  console.log(`Compared on ${compared} fixtures (matched by name)\n`);

  console.log(`Verdict agreement: ${agree}/${compared} = ${compared ? ((agree / compared) * 100).toFixed(1) : "n/a"}%`);
  if (flips.length) console.log("Flips:\n  " + flips.join("\n  "));

  console.log(`\nBaseline cost: $${baselineCost.toFixed(4)} total, $${(baselineCost / (compared || 1)).toFixed(4)}/decision`);
  console.log(`Routed cost:   $${routingCost.toFixed(4)} total, $${(routingCost / (compared || 1)).toFixed(4)}/decision`);
  console.log(`Cost change:   ${(((routingCost - baselineCost) / (baselineCost || 1)) * 100).toFixed(1)}%`);

  console.log(`\nBaseline latency p50/p95: ${percentile(baselineLatencies, 50)}ms / ${percentile(baselineLatencies, 95)}ms`);
  console.log(`Routed latency   p50/p95: ${percentile(routingLatencies, 50)}ms / ${percentile(routingLatencies, 95)}ms`);
}

main();
