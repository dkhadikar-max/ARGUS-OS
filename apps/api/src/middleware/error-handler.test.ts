import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { AppError } from "@argus/shared";
import { errorHandler } from "./error-handler.js";

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

  it("never mislabels an unexpected exception as a documented error code", () => {
    const res = mockResponse();
    errorHandler(new Error("db connection lost"), req, res, next);

    expect(res.statusCode).toBe(500);
    expect((res.body as { error: { code: string } }).error.code).toBe("INTERNAL_ERROR");
  });
});
