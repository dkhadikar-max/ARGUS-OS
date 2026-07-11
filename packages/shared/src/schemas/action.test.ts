import { describe, expect, it } from "vitest";
import { createActionRequestSchema } from "./action.js";

describe("createActionRequestSchema", () => {
  it("accepts a bare actionType with no details", () => {
    expect(createActionRequestSchema.safeParse({ actionType: "MESSAGE_SENT" }).success).toBe(true);
  });

  it("accepts actionType with a details object", () => {
    const result = createActionRequestSchema.safeParse({
      actionType: "MESSAGE_COPIED",
      details: { channel: "LINKEDIN" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown actionType (Bible §9.1 ActionType enum)", () => {
    expect(createActionRequestSchema.safeParse({ actionType: "MADE_COFFEE" }).success).toBe(false);
  });
});
