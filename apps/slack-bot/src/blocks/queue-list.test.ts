import { describe, expect, it } from "vitest";
import type { QueueResponse } from "@argus/shared";
import { buildQueueBlocks } from "./queue-list.js";

const emptyQueue: QueueResponse = {
  userId: "user_1",
  generatedAt: "2026-07-10T08:00:00Z",
  items: [],
  stats: { total: 0, strongYes: 0, yes: 0, wait: 0, pass: 0, newSinceYesterday: 0, reEngagements: 0 },
};

describe("buildQueueBlocks", () => {
  it("shows an encouraging empty state when the queue is empty (Bible UX audit: no bare-empty screens)", () => {
    const blocks = buildQueueBlocks(emptyQueue);
    expect(JSON.stringify(blocks)).toContain("Nothing in your queue");
  });

  it("renders each item with a rank, verdict, and a View button carrying its decisionId", () => {
    const queue: QueueResponse = {
      ...emptyQueue,
      items: [
        {
          rank: 1,
          decisionId: "dec_1",
          prospect: { name: "Sarah Chen", title: "VP Eng", companyName: "DataFlow", linkedInUrl: "https://linkedin.com/in/sarahchen" },
          verdict: "STRONG_YES",
          confidence: 96,
          priorityScore: 98.5,
          reason: "ICP match + high intent",
          lastActivity: "New since yesterday",
          suggestedAction: "Send LinkedIn message",
          messagePreview: "Hi Sarah",
          createdAt: "2026-07-10T08:00:00Z",
        },
      ],
      stats: { total: 1, strongYes: 1, yes: 0, wait: 0, pass: 0, newSinceYesterday: 1, reEngagements: 0 },
    };

    const blocks = buildQueueBlocks(queue);
    const itemBlock = blocks.find((b) => b.type === "section" && "accessory" in b) as {
      accessory: { action_id: string; value: string };
    };
    expect(itemBlock.accessory).toEqual(
      expect.objectContaining({ action_id: "queue_view_decision", value: "dec_1" }),
    );
  });

  it("caps rendering at 10 items to stay under Slack's block limit", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      rank: i + 1,
      decisionId: `dec_${i}`,
      prospect: { name: `Prospect ${i}`, title: null, companyName: null, linkedInUrl: "https://linkedin.com/in/x" },
      verdict: "YES" as const,
      confidence: 80,
      priorityScore: 50,
      reason: "reason",
      lastActivity: "New this week",
      suggestedAction: "Send LinkedIn message",
      messagePreview: null,
      createdAt: "2026-07-10T08:00:00Z",
    }));

    const blocks = buildQueueBlocks({ ...emptyQueue, items });
    const itemSections = blocks.filter((b) => b.type === "section" && "accessory" in b);
    expect(itemSections).toHaveLength(10);
  });
});
