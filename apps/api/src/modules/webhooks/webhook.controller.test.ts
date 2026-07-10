import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

const env = { CLERK_WEBHOOK_SECRET: undefined as string | undefined };
vi.mock("../../config/env.js", () => ({ env }));

const verify = vi.fn();
class MockWebhook {
  verify = verify;
}
vi.mock("svix", () => ({ Webhook: MockWebhook }));

const handleClerkWebhookEvent = vi.fn();
vi.mock("./webhook.service.js", () => ({ handleClerkWebhookEvent }));

const { clerkWebhookHandler } = await import("./webhook.controller.js");

function mockReq(headers: Record<string, string>, body: unknown = Buffer.from("{}")): Request {
  return { header: (name: string) => headers[name.toLowerCase()], body } as unknown as Request;
}

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
  env.CLERK_WEBHOOK_SECRET = undefined;
});

describe("clerkWebhookHandler", () => {
  it("rejects with FORBIDDEN when no webhook secret is configured", async () => {
    const next = vi.fn();
    await clerkWebhookHandler(mockReq({}), mockRes(), next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects with UNAUTHORIZED when Svix headers are missing", async () => {
    env.CLERK_WEBHOOK_SECRET = "whsec_test";
    const next = vi.fn();
    await clerkWebhookHandler(mockReq({}), mockRes(), next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects with UNAUTHORIZED when signature verification fails", async () => {
    env.CLERK_WEBHOOK_SECRET = "whsec_test";
    verify.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const next = vi.fn();
    await clerkWebhookHandler(
      mockReq({ "svix-id": "1", "svix-timestamp": "2", "svix-signature": "3" }),
      mockRes(),
      next,
    );
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("dispatches to handleClerkWebhookEvent and responds 200 on a valid signature", async () => {
    env.CLERK_WEBHOOK_SECRET = "whsec_test";
    verify.mockReturnValue({ type: "user.created", data: { id: "user_1" } });

    const res = mockRes();
    const next = vi.fn();
    await clerkWebhookHandler(
      mockReq({ "svix-id": "1", "svix-timestamp": "2", "svix-signature": "3" }),
      res,
      next,
    );

    expect(handleClerkWebhookEvent).toHaveBeenCalledWith("user.created", { id: "user_1" });
    expect(res.statusCode).toBe(200);
    expect(next).not.toHaveBeenCalled();
  });
});
