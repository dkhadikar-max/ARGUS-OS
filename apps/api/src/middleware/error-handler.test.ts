import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { AppError } from "@argus/shared";

const captureException = vi.fn();
vi.mock("../lib/sentry.js", () => ({ captureException }));

const { errorHandler } = await import("./error-handler.js");

function mockResponse() {
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

const req = { path: "/api/v1/decisions" } as Request;
const next = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("errorHandler", () => {
  it("maps AppError to its Bible §10.7 status code and envelope", () => {
    const res = mockResponse();
    errorHandler(
      new AppError("RATE_LIMITED", "Decision limit exceeded", undefined, { retryAfter: 42 }),
      req,
      res,
      next,
    );

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Decision limit exceeded",
        retryAfter: 42,
      },
    });
    // 4xx are expected client errors, not incidents -- shouldn't page anyone.
    expect(captureException).not.toHaveBeenCalled();
  });

  it("includes validation details when present", () => {
    const res = mockResponse();
    errorHandler(
      new AppError("VALIDATION_ERROR", "Invalid request data", [
        { field: "prospect.linkedInUrl", message: "Must be a valid LinkedIn URL" },
      ]),
      req,
      res,
      next,
    );

    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: [{ field: "prospect.linkedInUrl", message: "Must be a valid LinkedIn URL" }],
      },
    });
  });

  it("reports 5xx AppErrors to Sentry (Bible §18 INF-2)", () => {
    const res = mockResponse();
    errorHandler(new AppError("AI_UNAVAILABLE", "Claude is down"), req, res, next);

    expect(res.statusCode).toBe(503);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(AppError),
      expect.objectContaining({ code: "AI_UNAVAILABLE" }),
    );
  });

  it("never mislabels an unexpected exception as a documented error code", () => {
    const res = mockResponse();
    errorHandler(new Error("db connection lost"), req, res, next);

    expect(res.statusCode).toBe(500);
    expect((res.body as { error: { code: string } }).error.code).toBe("INTERNAL_ERROR");
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ path: "/api/v1/decisions" }));
  });
});
