import { describe, expect, it } from "vitest";
import { buildOutcomeOptionsBlocks } from "./outcome-options.js";

describe("buildOutcomeOptionsBlocks", () => {
  it("renders the 4 outcome buttons from Bible §6.4, all carrying the decisionId", () => {
    const blocks = buildOutcomeOptionsBlocks("dec_1");
    const actionsBlock = blocks.find((b) => b.type === "actions") as {
      elements: Array<{ action_id: string; value: string; text: { text: string } }>;
    };

    expect(actionsBlock.elements.map((e) => e.text.text)).toEqual([
      "Meeting Booked",
      "Replied — No Meeting",
      "No Response",
      "Negative Response",
    ]);
    expect(actionsBlock.elements.every((e) => e.value === "dec_1")).toBe(true);
  });

  it("maps 'Negative Response' to the DISQUALIFIED OutcomeType (no exact enum match exists)", () => {
    const blocks = buildOutcomeOptionsBlocks("dec_1");
    const actionsBlock = blocks.find((b) => b.type === "actions") as {
      elements: Array<{ action_id: string }>;
    };
    const negativeResponseAction = actionsBlock.elements[3];
    expect(negativeResponseAction?.action_id).toBe("outcome_log_DISQUALIFIED");
  });
});
