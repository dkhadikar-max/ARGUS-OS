import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiBlock } from "./KpiBlock.js";

describe("KpiBlock", () => {
  it("renders the label and value", () => {
    render(<KpiBlock label="Accuracy" value="82%" />);
    expect(screen.getByText("Accuracy")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  it("renders an optional caption", () => {
    render(<KpiBlock label="Override rate" value="12%" caption="Share of decisions a rep has overridden" />);
    expect(screen.getByText("Share of decisions a rep has overridden")).toBeInTheDocument();
  });

  it("omits the caption entirely when not given", () => {
    render(<KpiBlock label="Decisions logged" value="120" />);
    expect(screen.getByText("Decisions logged")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
  });

  it("applies an optional valueClassName to the metric", () => {
    render(<KpiBlock label="Override rate" value="45%" valueClassName="text-red-600" />);
    expect(screen.getByText("45%").className).toContain("text-red-600");
  });
});
