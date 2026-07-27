import { describe, expect, it } from "vitest";
import { allocate, denormalizeCost, deriveBudgetSnapshot, normalizeCost } from "./budget-manager.js";
import { AVG_DEAL_SIZE_USD } from "./decision-value.service.js";
import type { DecisionObjectiveValue, RawCost } from "./decision-state.js";

function objectiveValue(overrides: Partial<DecisionObjectiveValue> = {}): DecisionObjectiveValue {
  return {
    baseValue: AVG_DEAL_SIZE_USD,
    falsePositiveCost: 150,
    falseNegativeCost: 5000,
    timeHorizonHours: null,
    timeDecayRate: null,
    ...overrides,
  };
}

function rawCost(overrides: Partial<RawCost> = {}): RawCost {
  return { tokens: 1500, latencyMs: 82000, costUsd: 0.116, reasoningDepth: 5, ...overrides };
}

describe("normalizeCost", () => {
  it("computes tokenPoints as costUsd/baseValue * 100, plus 2 points per reasoning step, when timeDecayRate is null", () => {
    const points = normalizeCost(rawCost({ costUsd: 250, reasoningDepth: 5 }), objectiveValue({ baseValue: 25000, timeDecayRate: null }));
    // tokenPoints = 250/25000*100 = 1; latencyPoints = 0 (no decay rate); depthPoints = 5*2 = 10
    expect(points).toBeCloseTo(11, 10);
  });

  it("treats a null timeDecayRate as zero latency cost, not a fabricated one", () => {
    const withLatency = normalizeCost(rawCost({ latencyMs: 999_999_999 }), objectiveValue({ timeDecayRate: null }));
    const withoutLatency = normalizeCost(rawCost({ latencyMs: 0 }), objectiveValue({ timeDecayRate: null }));
    expect(withLatency).toBe(withoutLatency);
  });

  it("adds a real, non-zero latency penalty once a real timeDecayRate is supplied", () => {
    const noDecay = normalizeCost(rawCost({ latencyMs: 3_600_000 }), objectiveValue({ timeDecayRate: null }));
    const withDecay = normalizeCost(rawCost({ latencyMs: 3_600_000 }), objectiveValue({ timeDecayRate: 0.01 }));
    expect(withDecay).toBeGreaterThan(noDecay);
  });

  it("returns 0 when baseValue is not positive, rather than dividing by zero", () => {
    expect(normalizeCost(rawCost(), objectiveValue({ baseValue: 0 }))).toBe(0);
  });
});

describe("denormalizeCost", () => {
  it("recovers only the cost-USD magnitude -- tokens/latencyMs/reasoningDepth are not guessed", () => {
    const raw = denormalizeCost(50, objectiveValue({ baseValue: 25000 }));
    expect(raw.costUsd).toBeCloseTo(12500, 10);
    expect(raw.tokens).toBe(0);
    expect(raw.latencyMs).toBe(0);
    expect(raw.reasoningDepth).toBe(0);
  });

  it("returns 0 costUsd when baseValue is not positive", () => {
    expect(denormalizeCost(50, objectiveValue({ baseValue: 0 })).costUsd).toBe(0);
  });
});

describe("allocate", () => {
  it("scales linearly with complexity, starts fully unconsumed", () => {
    const low = allocate(0, objectiveValue());
    const high = allocate(1, objectiveValue());
    expect(high.initial).toBeGreaterThan(low.initial);
    expect(low.consumed).toBe(0);
    expect(low.remaining).toBe(low.initial);
  });

  it("computes rawEquivalent via the same denormalizeCost used elsewhere", () => {
    const value = objectiveValue({ baseValue: 25000 });
    const budget = allocate(0.5, value);
    expect(budget.rawEquivalent).toEqual(denormalizeCost(budget.initial, value));
  });
});

describe("deriveBudgetSnapshot", () => {
  it("returns 0 remainingReasoning for every real decision -- the fixed pipeline always spends all 5 real steps", () => {
    const snapshot = deriveBudgetSnapshot(rawCost({ reasoningDepth: 5 }), objectiveValue(), 0.5);
    expect(snapshot.remainingReasoning).toBe(0);
  });

  it("is positive when fewer than 5 reasoning steps were spent (not reachable against real data today, but a real, correct computation)", () => {
    const snapshot = deriveBudgetSnapshot(rawCost({ reasoningDepth: 2 }), objectiveValue(), 0.5);
    expect(snapshot.remainingReasoning).toBe(3);
  });

  it("returns Infinity for remainingLatency when no real timeDecayRate exists -- there is no real ceiling to run out of", () => {
    const snapshot = deriveBudgetSnapshot(rawCost(), objectiveValue({ timeDecayRate: null }), 0.5);
    expect(snapshot.remainingLatency).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns a finite remainingLatency once a real timeDecayRate exists", () => {
    const snapshot = deriveBudgetSnapshot(rawCost(), objectiveValue({ timeDecayRate: 0.01, timeHorizonHours: 24 }), 0.5);
    expect(Number.isFinite(snapshot.remainingLatency)).toBe(true);
  });

  it("computes remainingCost as the dollar-equivalent of the unconsumed normalized budget", () => {
    const value = objectiveValue({ baseValue: 25000 });
    const raw = rawCost({ costUsd: 0.116, reasoningDepth: 5 });
    const snapshot = deriveBudgetSnapshot(raw, value, 0.5);
    const allocated = allocate(0.5, value);
    const consumed = normalizeCost(raw, value);
    expect(snapshot.remainingCost).toBeCloseTo(denormalizeCost(allocated.initial - consumed, value).costUsd, 10);
  });

  it("never returns a negative remainingCost when the decision overspent its allocated budget", () => {
    const value = objectiveValue({ baseValue: 25000 });
    const overspentRaw = rawCost({ costUsd: 1_000_000, reasoningDepth: 5 });
    const snapshot = deriveBudgetSnapshot(overspentRaw, value, 0);
    expect(snapshot.remainingCost).toBe(0);
  });
});
