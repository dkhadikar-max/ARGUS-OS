import { AppError } from "@argus/shared";
import type { LLMProvider, LLMCallParams, LLMCallResult } from "./llm-provider.interface.js";

// Bug fix (Critical #7): ClaudeProvider is the only real LLMProvider --
// still true, and deliberately unchanged here (a second real provider is
// the "Decision Router" work explicitly deferred until after the 51-
// fixture benchmark, not this fix). What was genuinely missing: during a
// real Anthropic outage, every single request independently discovers the
// same fact -- each burns its own real network timeout, twice (callAgent's
// own MAX_ATTEMPTS), before failing. A circuit breaker shares that
// discovery across requests within one process: once enough real calls
// have failed in a row, new calls fail immediately (no network round trip)
// until a cooldown elapses, at which point exactly one real call is
// allowed through to test recovery. This does not add a fallback
// provider -- it makes the one real provider's failure mode fast and
// legible instead of every request hanging until its own timeout.
//
// Deliberately only trips on genuine provider-level failures (the
// underlying LLMProvider.call() itself throwing -- a network error, a 5xx,
// a timeout, an auth failure). It never sees schema-validation failures
// (a model producing malformed JSON) -- those happen entirely inside
// orchestrator.ts's callAgent, after LLMProvider.call() has already
// returned successfully, and are a content problem, not an availability
// one. Conflating the two would trip the breaker on the model's own
// output quality, which has nothing to do with whether Anthropic is up.

export type CircuitState = "closed" | "open" | "half_open";

// Not derived from any real production incident data -- no real outage has
// ever been measured against a variable threshold/cooldown to tune these.
// Reasonable, explicitly-placeholder defaults pending real data, the same
// honest-placeholder treatment budget-manager.ts's BASE_BUDGET_POINTS
// already uses.
const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 30_000;

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  /** Real wall-clock source, injectable so tests don't need real timers. */
  now?: () => number;
}

/**
 * Wraps any LLMProvider with a real, minimal circuit breaker:
 *   closed (normal) -- calls pass through; consecutiveFailures increments
 *     on each real failure, resets to 0 on any real success.
 *   open -- consecutiveFailures reached failureThreshold. New calls are
 *     rejected immediately, no real API call attempted, until cooldownMs
 *     has elapsed since the breaker opened.
 *   half_open -- cooldown elapsed; exactly one real call is allowed
 *     through as a trial. Success closes the breaker (reset). Failure
 *     reopens it (cooldown restarts).
 */
export class CircuitBreakerProvider implements LLMProvider {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(
    private readonly inner: LLMProvider,
    options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.now = options.now ?? Date.now;
  }

  getState(): CircuitState {
    if (this.state === "open" && this.openedAt !== null && this.now() - this.openedAt >= this.cooldownMs) {
      return "half_open";
    }
    return this.state;
  }

  async call(params: LLMCallParams): Promise<LLMCallResult> {
    const currentState = this.getState();

    if (currentState === "open") {
      throw new AppError(
        "AI_UNAVAILABLE",
        "Unable to generate a decision right now. Please retry shortly.",
        undefined,
        { cause: `Circuit breaker open -- ${this.consecutiveFailures} consecutive real provider failures` },
      );
    }

    try {
      const result = await this.inner.call(params);
      this.consecutiveFailures = 0;
      this.state = "closed";
      this.openedAt = null;
      return result;
    } catch (err) {
      this.consecutiveFailures += 1;
      if (currentState === "half_open" || this.consecutiveFailures >= this.failureThreshold) {
        this.state = "open";
        this.openedAt = this.now();
      }
      throw err;
    }
  }
}
