import { describe, expect, it, vi, afterEach } from "vitest";
import type { Evidence } from "@argus/database";
import { observeCapabilityOutputs } from "./capability-shadow.js";
import type { ExecutionIdentity } from "./reasoning-capability.js";
import { logger } from "../lib/logger.js";

const fakeIdentity: ExecutionIdentity = { teamId: "team_1", userId: "user_1", prospectId: "p1", prospectName: "Acme Co" };

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: "e1",
    type: "FIRMOGRAPHIC",
    source: "APOLLO",
    data: {},
    confidence: 80,
    extractedAt: new Date(),
    isStale: false,
    prospectId: "p1",
    decisionId: null,
    ...overrides,
  } as Evidence;
}

describe("observeCapabilityOutputs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invokes all 4 real retriever capabilities and returns their real outputs, keyed by stage", async () => {
    const pool = [makeEvidence({ id: "firmo", type: "FIRMOGRAPHIC" }), makeEvidence({ id: "intent-sig", type: "INTENT" })];

    const result = await observeCapabilityOutputs("dec_1", pool, fakeIdentity);

    expect(Object.keys(result).sort()).toEqual(["icp", "intent", "research", "risk"]);
    // ResearchRetriever's real type-scoped filter should keep only FIRMOGRAPHIC here.
    expect(result.research?.outputs.map((e) => e.id)).toEqual(["firmo"]);
  });

  it("honestly returns confidence 0 and no evidence when the real pool is empty (a new prospect with no prior decisions)", async () => {
    const result = await observeCapabilityOutputs("dec_1", [], fakeIdentity);
    for (const output of Object.values(result)) {
      expect(output.confidence).toBe(0);
      expect(output.evidenceProduced).toEqual([]);
    }
  });

  it("logs a summary (confidence/evidenceCount/latencyMs) for every stage, not fabricated 'selection'", async () => {
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => logger);
    await observeCapabilityOutputs("dec_1", [makeEvidence()], fakeIdentity);

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const call = infoSpy.mock.calls[0] ?? [];
    const [payload, message] = call as [{ decisionId: string; evidencePoolSize: number; capabilities: Record<string, unknown> }, string];
    expect(message).toContain("Capability outputs shadow-recorded");
    expect(payload.decisionId).toBe("dec_1");
    expect(payload.evidencePoolSize).toBe(1);
    expect(Object.keys(payload.capabilities).sort()).toEqual(["icp", "intent", "research", "risk"]);
  });
});
