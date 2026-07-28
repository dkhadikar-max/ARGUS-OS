# qwen2.5:3b evaluation: INCOMPLETE due to provider/runtime compatibility

**Status: Evaluation incomplete due to provider/runtime compatibility concerns
-- NOT "model unsuitable".** These are different claims; do not conflate them
in any future report or comparison.

## Finding

Ollama 0.32.4's chat template for qwen2.5:3b requires the model to self-emit
`<tool_call>{"name":...,"arguments":...}</tool_call>` as raw generated text,
which Ollama's server then parses out post-hoc into the response's
`tool_calls` field (fundamentally different from llama3.2:3b's template,
which embeds the function list directly into the user message and expects
plain JSON back). Under this pipeline's real prompts, that parsing silently
fails: the response comes back with `message.content: ""` and no
`tool_calls` field at all, despite `eval_count` showing the model genuinely
generated 150-300+ tokens. Ollama's parser appears unable to extract a
malformed or incompletely-closed `<tool_call>` block, and doesn't fall back
to surfacing it as plain content either.

## Real, bounded experiments run (2026-07-28)

| Prompt | Tokens (prompt_eval_count) | Result |
|---|---:|---|
| Trivial synthetic ("submit the color you observed") | 310 | Works -- clean tool call |
| Synthetic minimal input, REAL system prompt + fillPlaceholders | 1134 | Fails -- empty content, no tool_calls |
| Shortest real fixture (`edge-all-null-evidence`) | 1311 | Fails |
| Longest tested real fixture (`conflicting-signals-hiring-freeze`) | 1449 | Fails |

Every real production fixture in `eval/fixtures/` falls in the 1311-1449
token range (measured directly, all 51 fixtures) -- entirely past the
310-1134 token boundary where this breaks. **Every real fixture will fail,
100% of the time, regardless of which one is used.** This is not
prompt-specific noise; two full 15-fixture harness runs (0/15 each) already
confirmed this empirically before the root cause was isolated.

The one prompt short enough to succeed (310 tokens) produced genuinely
strong structured output: `data_points` as a real array of correctly-typed
objects, `confidence` as a real number (0.85), not a stringified value --
better raw quality than llama3.2:3b has shown in this pipeline. There is no
evidence qwen2.5:3b is incapable of this task; there is strong evidence
this specific runtime (Ollama 0.32.4's qwen2.5 chat template) cannot
currently service prompts this pipeline actually sends.

## What would resolve this (not attempted -- out of scope for this session)

- A newer Ollama version with a fixed/more robust qwen2.5 tool-call parser.
- A different local inference backend for the same model weights (vLLM,
  llama.cpp directly, etc.) to isolate whether this is Ollama-specific.
- Manually parsing `<tool_call>` blocks out of `message.content` ourselves
  instead of relying on Ollama's server-side extraction -- viable but not
  attempted here, since `message.content` came back empty too (Ollama
  appears to consume/discard the raw text even when it fails to parse it
  into `tool_calls`, so this may not even be recoverable client-side
  without a raw/streaming response mode this provider doesn't currently use).

## Manifests referenced (gitignored, listed by name for reproducibility)

- `eval/runs/likelihood-harness_qwen2.5-3b_repair_2026-07-28T06-26-52-536Z.json` (1 fixture, pre-tool_choice-fix)
- `eval/runs/likelihood-harness_qwen2.5-3b_repair_2026-07-28T06-34-01-171Z.json` (3 fixtures, pre-tool_choice-fix)
- `eval/runs/likelihood-harness_qwen2.5-3b_repair_2026-07-28T08-58-22-989Z.json` (15 fixtures, POST-tool_choice-fix, 0/15 -- the run that triggered this investigation)
