import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { QueueItem } from "@argus/shared";

// QueueItemCard pulls in next/navigation + Server Actions -- irrelevant to
// QueueList's own filter/sort logic under test here, so it's replaced with
// a minimal stand-in that renders just enough to assert on list contents
// and order.
vi.mock("./QueueItemCard", () => ({
  QueueItemCard: ({ item }: { item: QueueItem }) => <li>{item.prospect.name}</li>,
}));

const track = vi.fn();
vi.mock("../lib/analytics", () => ({ track }));

const { QueueList } = await import("./QueueList.js");

beforeEach(() => {
  vi.clearAllMocks();
});

function item(overrides: Partial<QueueItem>): QueueItem {
  return {
    rank: 1,
    decisionId: "dec_1",
    prospect: { name: "Sarah Chen", title: null, companyName: null, linkedInUrl: "https://linkedin.com/in/sarahchen" },
    verdict: "STRONG_YES",
    confidence: 90,
    priorityScore: 90,
    reason: "ICP match",
    lastActivity: "New since yesterday",
    suggestedAction: "Message now",
    messagePreview: null,
    createdAt: "2026-07-10T00:00:00Z",
    ...overrides,
  };
}

function names(): string[] {
  return screen.getAllByRole("listitem").map((li) => li.textContent);
}

describe("QueueList", () => {
  it("renders every item when no filter is applied", () => {
    render(
      <QueueList
        items={[item({ decisionId: "dec_1", prospect: { name: "Sarah", title: null, companyName: null, linkedInUrl: "u" } })]}
      />,
    );
    expect(names()).toEqual(["Sarah"]);
  });

  it("fires queue_viewed once on mount with the real item count (Bible §11.1)", () => {
    render(
      <QueueList
        items={[
          item({ decisionId: "dec_1" }),
          item({ decisionId: "dec_2" }),
        ]}
      />,
    );
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith({
      name: "queue_viewed",
      properties: { item_count: 2, filter_applied: false },
    });
  });

  it("hides items whose verdict is toggled off, and un-hides on a second click", async () => {
    const user = userEvent.setup();
    render(
      <QueueList
        items={[
          item({ decisionId: "dec_1", verdict: "STRONG_YES", prospect: { name: "Sarah", title: null, companyName: null, linkedInUrl: "u" } }),
          item({ decisionId: "dec_2", verdict: "PASS", prospect: { name: "Marcus", title: null, companyName: null, linkedInUrl: "u" } }),
        ]}
      />,
    );

    expect(names()).toEqual(["Sarah", "Marcus"]);

    await user.click(screen.getByRole("button", { name: "Strong yes" }));
    expect(names()).toEqual(["Marcus"]);

    await user.click(screen.getByRole("button", { name: "Strong yes" }));
    expect(names()).toEqual(["Sarah", "Marcus"]);
  });

  it("shows an empty-filter state (not the no-items state) when every visible item is filtered out", async () => {
    const user = userEvent.setup();
    render(<QueueList items={[item({ verdict: "STRONG_YES" })]} />);

    await user.click(screen.getByRole("button", { name: "Strong yes" }));

    expect(screen.getByText("No prospects match these filters")).toBeInTheDocument();
  });

  it("sorts by confidence descending when selected", async () => {
    const user = userEvent.setup();
    render(
      <QueueList
        items={[
          item({ decisionId: "dec_1", confidence: 60, prospect: { name: "Low", title: null, companyName: null, linkedInUrl: "u" } }),
          item({ decisionId: "dec_2", confidence: 95, prospect: { name: "High", title: null, companyName: null, linkedInUrl: "u" } }),
        ]}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox"), "confidence");

    expect(names()).toEqual(["High", "Low"]);
  });

  it("sorts by most recent (createdAt descending) when selected", async () => {
    const user = userEvent.setup();
    render(
      <QueueList
        items={[
          item({ decisionId: "dec_1", createdAt: "2026-07-01T00:00:00Z", prospect: { name: "Older", title: null, companyName: null, linkedInUrl: "u" } }),
          item({ decisionId: "dec_2", createdAt: "2026-07-10T00:00:00Z", prospect: { name: "Newer", title: null, companyName: null, linkedInUrl: "u" } }),
        ]}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox"), "recency");

    expect(names()).toEqual(["Newer", "Older"]);
  });
});
