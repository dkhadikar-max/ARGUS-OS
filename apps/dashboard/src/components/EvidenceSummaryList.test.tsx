import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvidenceSummaryList } from "./EvidenceSummaryList.js";

describe("EvidenceSummaryList", () => {
  it("shows an empty state when evidence is []", () => {
    render(<EvidenceSummaryList evidence={[]} />);
    expect(screen.getByText("No evidence recorded")).toBeInTheDocument();
  });

  it("renders each evidence card's type, signal, relevance, and confidence", () => {
    render(
      <EvidenceSummaryList
        evidence={[
          { id: "ev_1", type: "FIRMOGRAPHIC", signal: "Series B", relevance: "funding stage", confidence: 90 },
        ]}
      />,
    );

    expect(screen.getByText("FIRMOGRAPHIC")).toBeInTheDocument();
    expect(screen.getByText("Series B")).toBeInTheDocument();
    expect(screen.getByText("funding stage")).toBeInTheDocument();
    expect(screen.getByText("90% confidence")).toBeInTheDocument();
  });
});
