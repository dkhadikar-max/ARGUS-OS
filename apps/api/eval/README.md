# Evaluation & benchmark infrastructure

This directory holds ARGUS's eval/benchmark tooling: fixture-driven runs
against the real pipeline stages (`run*.ts`), an immutable benchmark
registry (`registry.ts`), and the local-model validation harness
(`likelihood-harness.ts` + `aggregate-likelihood-runs.ts`). This file
covers the two things that apply across all of it, not just one script.

## Benchmark results are distributions, not point estimates

**Do not quote a single run's number as "the" result for a model.** This
isn't a style preference -- it's a documented, real finding from this
project's own data.

On 2026-07-28, three 15-fixture runs of the exact same model
(`llama3.2:3b`), the exact same fixtures, and the exact same repair logic
produced three different schema-valid-after-repair rates:

| Run | Repair-valid |
|---|---:|
| 1 | 26.7% |
| 2 | 60.0% |
| 3 | 40.0% |

Mean 42.2%, median 40.0%, sample stddev **16.8 percentage points**. That
spread comes entirely from LLM sampling stochasticity (Ollama's defaults
use no fixed seed / temperature=0) -- nothing about the model, fixtures, or
harness changed between runs. Quoting any single one of those three numbers
as "the" benchmark result would have been directionally misleading by more
than 30 points in either direction.

**Practical rule**: before treating a benchmark number as meaningful (for a
promotion decision, a model comparison, or a regression check), either run
`eval:aggregate-likelihood-runs` over multiple same-size, same-mode,
same-model runs and report the distribution (mean/median/stddev/range), or
explicitly flag a single-run number as an unverified point estimate that
could plausibly be off by ±15-20 percentage points until more samples
exist. `eval:aggregate-likelihood-runs` refuses to silently pool
incompatible runs (different model, different `--repair`/raw mode,
different fixture count) into one misleading average -- see its own module
comment for exactly what it checks.

## What `benchmark-suite-v1.0` (and future `benchmark-suite-vN` tags) mean

A `benchmark-suite-vN` git tag identifies the **evaluation methodology**:
the fixture set (`eval/fixtures/`), the stage(s) measured, the frozen
harness version (`likelihood-harness.ts`'s failure taxonomy, protocol
metrics, and repair-layer scope), and the manifest schema version
(`MANIFEST_SCHEMA_VERSION` in `likelihood-harness.ts`) -- **not** any
specific model's score. The point of freezing the methodology under one
tag is that any future model (a different local model, a different
provider, a future Claude checkpoint) can be run against the exact same
suite and produce a directly comparable result, without re-deriving what
"schema-valid" or "repaired" or "protocol violation" even means each time.

A model's actual score is a property of a specific run (or, per the
section above, a distribution of runs) against that suite -- it is never
part of the tag itself. `git tag -n1 benchmark-suite-v1.0` documents the
known runs at tagging time as evidence, not as the tag's claim.

## Repair layer scope (frozen)

`--repair` mode in `likelihood-harness.ts` is a **serialization** repair
layer, not a semantic one: bounded to primitive coercion (JSON-decoding a
top-level array field that came back as a string, parsing a top-level
number/boolean field that came back as a string). It never invents missing
fields, interprets prose, or reaches into nested array items. See that
file's own `REPAIR LAYER SCOPE` comment for the full reasoning and the
real failure taxonomy (A1-A3 serialization, B1-B4 model-reasoning, C1
protocol violation) that motivated where the line is drawn.
