import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatLine } from "./StatLine.js";

describe("StatLine", () => {
  it("renders the label, stat, and body content", () => {
    render(
      <StatLine label="HIRING" stat="82% confidence">
        Companies hiring SRE roles convert higher.
      </StatLine>,
    );

    expect(screen.getByText("HIRING")).toBeInTheDocument();
    expect(screen.getByText("82% confidence")).toBeInTheDocument();
    expect(screen.getByText("Companies hiring SRE roles convert higher.")).toBeInTheDocument();
  });

  it("renders non-string children (e.g. a fragment) as the body", () => {
    render(
      <StatLine label="Reply rate" stat="42%">
        <span>ROI-focused opener</span>
      </StatLine>,
    );

    expect(screen.getByText("ROI-focused opener")).toBeInTheDocument();
  });
});
