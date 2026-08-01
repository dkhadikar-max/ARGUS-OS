import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CompanyMemoryResponse, DecisionResponse } from "@argus/shared";
import { MemoryPane } from "./MemoryPane.js";

function memory(overrides: Partial<CompanyMemoryResponse> = {}): CompanyMemoryResponse {
  return {
    teamId: "team_1",
    generatedAt: "2026-07-10T00:00:00Z",
    patterns: [],
    riskFlags: [],
    icpAccuracy: null,
    topPerformingMessages: [],
    learningInsights: null,
    ...overrides,
  };
}

function decision(overrides: Partial<DecisionResponse> = {}): DecisionResponse {
  return {
    id: "dec_1",
    status: "completed",
    prospect: { name: "Sarah", title: null, companyName: null, linkedInUrl: "u" },
    verdict: "STRONG_YES",
    confidence: 90,
    reasoning: "Strong fit.",
    evidence: [],
    message: { linkedin: null, email: null, tone: "professional", personalizationHooks: [] },
    recommendedAction: "message_now",
    processingTimeMs: 100,
    createdAt: "2026-07-10T00:00:00Z",
    ...overrides,
  };
}

describe("MemoryPane", () => {
  it("shows the real empty-state copy when there are no patterns or playbooks", () => {
    render(<MemoryPane memory={memory()} decision={null} />);
    // The real /company-memory page's own copy shows "No patterns yet" for
    // BOTH the patterns and (verbatim-reused, not a bug introduced here)
    // the playbooks empty state -- so this asserts 2, not 1.
    expect(screen.getAllByText("No patterns yet")).toHaveLength(2);
    expect(
      screen.getByText("Patterns appear here once your team has logged enough outcomes for ARGUS to spot a trend."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This fills in once enough messages using the same personalization hook have a logged outcome."),
    ).toBeInTheDocument();
  });

  it("renders patterns as a structured stat line + description, not a paragraph dump", () => {
    render(
      <MemoryPane
        memory={memory({
          patterns: [
            { id: "p1", description: "VP Eng titles convert 2x more often", evidence: "n=40", confidence: 82, type: "TITLE", createdAt: "2026-07-01T00:00:00Z" },
          ],
        })}
        decision={null}
      />,
    );

    expect(screen.getByText("TITLE")).toBeInTheDocument();
    expect(screen.getByText("82% confidence")).toBeInTheDocument();
    expect(screen.getByText("VP Eng titles convert 2x more often")).toBeInTheDocument();
  });

  it("renders playbooks as a structured reply-rate stat line", () => {
    render(
      <MemoryPane
        memory={memory({ topPerformingMessages: [{ pattern: "ROI-focused opener", replyRate: 0.42, sampleSize: 12 }] })}
        decision={null}
      />,
    );

    expect(screen.getByText("42% reply rate — 12 samples")).toBeInTheDocument();
    expect(screen.getByText("ROI-focused opener")).toBeInTheDocument();
  });

  it("promotes patterns matching the selected prospect's real evidence signals to the top", () => {
    const patterns = [
      { id: "p1", description: "Unrelated pattern about pricing", evidence: "n=10", confidence: 60, type: "PRICING", createdAt: "2026-07-01T00:00:00Z" },
      { id: "p2", description: "Companies hiring SRE roles convert higher", evidence: "n=30", confidence: 90, type: "HIRING", createdAt: "2026-07-01T00:00:00Z" },
    ];
    const d = decision({ evidence: [{ id: "e1", type: "INTENT", signal: "hiring SRE roles", relevance: "growth", confidence: 80 }] });

    render(<MemoryPane memory={memory({ patterns })} decision={d} />);

    const renderedOrder = screen.getAllByText(/PRICING|HIRING/).map((el) => el.textContent);
    expect(renderedOrder).toEqual(["HIRING", "PRICING"]);
  });

  it("never fabricates a per-prospect similarity number", () => {
    render(
      <MemoryPane
        memory={memory({
          patterns: [{ id: "p1", description: "Some pattern", evidence: "n=5", confidence: 70, type: "TITLE", createdAt: "2026-07-01T00:00:00Z" }],
        })}
        decision={null}
      />,
    );
    expect(screen.queryByText(/similar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/similarity/i)).not.toBeInTheDocument();
  });

  it("links to the full company-memory page", () => {
    render(<MemoryPane memory={memory()} decision={null} />);
    expect(screen.getByRole("link", { name: "View full history →" })).toHaveAttribute("href", "/company-memory");
  });
});
