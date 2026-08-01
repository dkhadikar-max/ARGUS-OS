import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { QueueItem } from "@argus/shared";

const recordQueueActionAction = vi.fn();
vi.mock("../../app/queue/actions", () => ({ recordQueueActionAction }));

const { useUndoableQueueAction } = await import("./useUndoableQueueAction.js");

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    rank: 1,
    decisionId: "dec_1",
    prospect: { name: "Sarah Chen", title: null, companyName: null, linkedInUrl: "u" },
    verdict: "STRONG_YES",
    confidence: 96,
    priorityScore: 96,
    reason: "ICP match",
    lastActivity: "New since yesterday",
    suggestedAction: "Message now",
    messagePreview: null,
    createdAt: "2026-07-10T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  recordQueueActionAction.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useUndoableQueueAction", () => {
  it("hides the item from visibleItems immediately, before the timer elapses", () => {
    const items = [item({ decisionId: "dec_1" }), item({ decisionId: "dec_2" })];
    const { result } = renderHook(() => useUndoableQueueAction(items));

    act(() => {
      result.current.performAction(items[0], "PASSED", "Skipped Sarah Chen");
    });

    expect(result.current.visibleItems.map((i) => i.decisionId)).toEqual(["dec_2"]);
    expect(result.current.pending).toEqual({ decisionId: "dec_1", label: "Skipped Sarah Chen" });
    expect(recordQueueActionAction).not.toHaveBeenCalled();
  });

  it("does not call the real action until the 5s window elapses", async () => {
    const items = [item({ decisionId: "dec_1" })];
    const { result } = renderHook(() => useUndoableQueueAction(items));

    act(() => {
      result.current.performAction(items[0], "PASSED", "Skipped Sarah Chen");
    });
    expect(recordQueueActionAction).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(recordQueueActionAction).toHaveBeenCalledWith("dec_1", "PASSED", undefined);
    expect(result.current.pending).toBeNull();
  });

  it("Undo cancels the timer and restores the item -- the real action is never sent", async () => {
    const items = [item({ decisionId: "dec_1" })];
    const { result } = renderHook(() => useUndoableQueueAction(items));

    act(() => {
      result.current.performAction(items[0], "PASSED", "Skipped Sarah Chen");
    });
    act(() => {
      result.current.undo();
    });

    expect(result.current.visibleItems.map((i) => i.decisionId)).toEqual(["dec_1"]);
    expect(result.current.pending).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(recordQueueActionAction).not.toHaveBeenCalled();
  });

  it("starting a second action while one is pending flushes the first immediately", () => {
    const items = [item({ decisionId: "dec_1" }), item({ decisionId: "dec_2" })];
    const { result } = renderHook(() => useUndoableQueueAction(items));

    act(() => {
      result.current.performAction(items[0], "PASSED", "Skipped Sarah Chen");
    });
    act(() => {
      result.current.performAction(items[1], "MESSAGE_COPIED", "Messaged");
    });

    expect(recordQueueActionAction).toHaveBeenCalledTimes(1);
    expect(recordQueueActionAction).toHaveBeenCalledWith("dec_1", "PASSED", undefined);
    expect(result.current.visibleItems).toEqual([]);
    expect(result.current.pending).toEqual({ decisionId: "dec_2", label: "Messaged" });
  });

  it("commits a still-pending action on unmount", () => {
    const items = [item({ decisionId: "dec_1" })];
    const { result, unmount } = renderHook(() => useUndoableQueueAction(items));

    act(() => {
      result.current.performAction(items[0], "PASSED", "Skipped Sarah Chen");
    });
    unmount();

    expect(recordQueueActionAction).toHaveBeenCalledWith("dec_1", "PASSED", undefined);
  });

  it("passes optional details through to the real action", async () => {
    const items = [item({ decisionId: "dec_1" })];
    const { result } = renderHook(() => useUndoableQueueAction(items));

    act(() => {
      result.current.performAction(items[0], "MESSAGE_COPIED", "Messaged", { channel: "LINKEDIN" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(recordQueueActionAction).toHaveBeenCalledWith("dec_1", "MESSAGE_COPIED", { channel: "LINKEDIN" });
  });
});
