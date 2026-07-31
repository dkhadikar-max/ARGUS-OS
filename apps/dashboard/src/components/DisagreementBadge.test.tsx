import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DisagreementBadge } from "./DisagreementBadge.js";

describe("DisagreementBadge", () => {
  it("renders an Agreement pill when verdictAgreement is true and no categories fired", () => {
    render(<DisagreementBadge verdictAgreement={true} disagreementCategories={[]} />);
    expect(screen.getByText("Agreement")).toBeInTheDocument();
  });

  it("renders one pill per disagreement category", () => {
    render(
      <DisagreementBadge
        verdictAgreement={false}
        disagreementCategories={["verdict_mismatch", "confidence_threshold_exceeded"]}
      />,
    );
    expect(screen.getByText("Verdict mismatch")).toBeInTheDocument();
    expect(screen.getByText("Confidence delta")).toBeInTheDocument();
  });

  it("renders a generic Disagreement pill when verdictAgreement is false but no category fired", () => {
    render(<DisagreementBadge verdictAgreement={false} disagreementCategories={[]} />);
    expect(screen.getByText("Disagreement")).toBeInTheDocument();
  });
});
