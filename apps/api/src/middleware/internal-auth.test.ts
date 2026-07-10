import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const env = { INTERNAL_SERVICE_TOKEN: undefined as string | undefined };
vi.mock("../config/env.js", () => ({ env }));

const { requireInternalService } = await import("./internal-auth.js");

function mockReq(token?: string): Request {
  return { header: () => token } as unknown as Request;
}

describe("requireInternalService", () => {
  it("rejects with FORBIDDEN when INTERNAL_SERVICE_TOKEN isn't configured", () => {
    env.INTERNAL_SERVICE_TOKEN = undefined;
    const next = vi.fn();
    requireInternalService(mockReq("whatever"), {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a wrong token with UNAUTHORIZED", () => {
    env.INTERNAL_SERVICE_TOKEN = "the-real-secret";
    const next = vi.fn();
    requireInternalService(mockReq("wrong-secret"), {} as Response, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("passes through with the correct token", () => {
    env.INTERNAL_SERVICE_TOKEN = "the-real-secret";
    const next = vi.fn();
    requireInternalService(mockReq("the-real-secret"), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});
