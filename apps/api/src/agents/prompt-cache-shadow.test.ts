import { describe, expect, it } from "vitest";
import { createCacheKeyTracker, observePromptCaching, type CacheKeyTracker } from "./prompt-cache-shadow.js";
import type { DecisionAgentInput } from "./orchestrator.js";

function input(overrides: Partial<DecisionAgentInput> = {}): DecisionAgentInput {
  return {
    prospectData: { profile: { name: "Jane" } },
    teamIcp: { minSize: 50 },
    companyMemory: null,
    intentSignals: null,
    historicalEngagement: [],
    teamHistory: [],
    userPreferences: null,
    teamPatterns: null,
    companyContext: null,
    ...overrides,
  };
}

describe("createCacheKeyTracker", () => {
  it("reports a first-seen key as new and consistent", () => {
    const tracker = createCacheKeyTracker();
    expect(tracker.observe("key-a", "hash-1")).toEqual({ isNewKey: true, consistent: true });
  });

  it("reports a repeated key with the same hash as not-new but consistent", () => {
    const tracker = createCacheKeyTracker();
    tracker.observe("key-a", "hash-1");
    expect(tracker.observe("key-a", "hash-1")).toEqual({ isNewKey: false, consistent: true });
  });

  it("flags a repeated key with a DIFFERENT hash as inconsistent -- the real collision case", () => {
    const tracker = createCacheKeyTracker();
    tracker.observe("key-a", "hash-1");
    expect(tracker.observe("key-a", "hash-2")).toEqual({ isNewKey: false, consistent: false });
  });

  it("evicts the oldest entry once maxEntries is exceeded (bounded, not unbounded growth)", () => {
    const tracker = createCacheKeyTracker(2);
    tracker.observe("key-1", "hash-1");
    tracker.observe("key-2", "hash-2");
    tracker.observe("key-3", "hash-3"); // should evict key-1
    expect(tracker.observe("key-1", "hash-1")).toEqual({ isNewKey: true, consistent: true });
  });
});

describe("observePromptCaching", () => {
  it("reports all 5 stages as new+consistent on first observation, then not-new+consistent on a repeat", () => {
    const tracker = createCacheKeyTracker();
    const decisionInput = input();

    const first = observePromptCaching(decisionInput, tracker);
    expect(first).toHaveLength(5);
    expect(first.every((o) => o.isNewKey && o.consistent)).toBe(true);

    const second = observePromptCaching(decisionInput, tracker);
    expect(second.every((o) => !o.isNewKey && o.consistent)).toBe(true);
    // Same cache keys both times, since companyContext (the real determinant
    // of system-prompt content) is unchanged.
    expect(second.map((o) => o.cacheKey)).toEqual(first.map((o) => o.cacheKey));
  });

  it("does NOT produce different cache keys when team-level knowledge (teamIcp) differs -- the system prompt never reads it", () => {
    const tracker = createCacheKeyTracker();
    const a = observePromptCaching(input({ teamIcp: { minSize: 50 } }), tracker);
    const b = observePromptCaching(input({ teamIcp: { minSize: 999 } }), tracker);
    expect(a.map((o) => o.cacheKey)).toEqual(b.map((o) => o.cacheKey));
    // Real invariant proof, not just equal keys: the two really do render the
    // exact same system prompt, so equal keys are actually correct here.
    expect(a.every((o) => o.consistent)).toBe(true);
    expect(b.every((o) => o.consistent)).toBe(true);
  });

  it("does NOT produce different cache keys when per-prospect fields (prospectData) differ", () => {
    const tracker = createCacheKeyTracker();
    const a = observePromptCaching(input({ prospectData: { profile: { name: "Jane" } } }), tracker);
    const b = observePromptCaching(input({ prospectData: { profile: { name: "A Totally Different Name" } } }), tracker);
    expect(a.map((o) => o.cacheKey)).toEqual(b.map((o) => o.cacheKey));
    expect(a.every((o) => o.consistent)).toBe(true);
    expect(b.every((o) => o.consistent)).toBe(true);
  });

  it("DOES produce different cache keys when companyContext differs -- the real determinant of system-prompt content", () => {
    const tracker = createCacheKeyTracker();
    const a = observePromptCaching(input({ companyContext: "We sell CRM software." }), tracker);
    const b = observePromptCaching(input({ companyContext: "We sell observability tooling." }), tracker);
    expect(a.map((o) => o.cacheKey)).not.toEqual(b.map((o) => o.cacheKey));
  });

  it("surfaces an inconsistent observation from the injected tracker (wiring test)", () => {
    const alwaysMismatch: CacheKeyTracker = {
      observe: () => ({ isNewKey: false, consistent: false }),
    };
    const observations = observePromptCaching(input(), alwaysMismatch);
    expect(observations.every((o) => !o.consistent)).toBe(true);
  });
});
