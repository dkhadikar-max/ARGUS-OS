import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

const increment = vi.fn();
const timing = vi.fn();
vi.mock("../lib/datadog.js", () => ({ increment, timing }));

const { metrics } = await import("./metrics.js");

function mockResponse(statusCode: number) {
  let finishCallback: (() => void) | undefined;
  const res = {
    statusCode,
    on(event: string, cb: () => void) {
      if (event === "finish") finishCallback = cb;
      return res;
    },
    emitFinish() {
      finishCallback?.();
    },
  };
  return res as unknown as Response & { statusCode: number; emitFinish: () => void };
}

const next = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("metrics middleware", () => {
  it("calls next() synchronously without waiting for the response to finish", () => {
    const req = { method: "GET", path: "/health", baseUrl: "" } as Request;
    const res = mockResponse(200);

    metrics(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(timing).not.toHaveBeenCalled();
  });

  it("records duration and count tagged by route, method, and status once the response finishes", () => {
    const req = { method: "GET", path: "/api/v1/decisions/dec_1", baseUrl: "/api/v1/decisions", route: { path: "/:id" } } as unknown as Request;
    const res = mockResponse(200);

    metrics(req, res, next);
    res.emitFinish();

    expect(timing).toHaveBeenCalledWith(
      "http.request.duration",
      expect.any(Number),
      { method: "GET", route: "/api/v1/decisions/:id", status: "200" },
    );
    expect(increment).toHaveBeenCalledWith(
      "http.request.count",
      { method: "GET", route: "/api/v1/decisions/:id", status: "200" },
    );
  });

  it("falls back to the raw path when no route matched (e.g. a 404)", () => {
    const req = { method: "GET", path: "/not-a-real-route", baseUrl: "" } as Request;
    const res = mockResponse(404);

    metrics(req, res, next);
    res.emitFinish();

    expect(increment).toHaveBeenCalledWith(
      "http.request.count",
      { method: "GET", route: "/not-a-real-route", status: "404" },
    );
  });

  it("increments a dedicated error counter for 5xx responses, not for 4xx", () => {
    const req = { method: "POST", path: "/api/v1/decisions", baseUrl: "/api/v1/decisions", route: { path: "/" } } as unknown as Request;

    const serverError = mockResponse(500);
    metrics(req, serverError, next);
    serverError.emitFinish();
    expect(increment).toHaveBeenCalledWith("http.request.errors", expect.any(Object));

    increment.mockClear();

    const clientError = mockResponse(422);
    metrics(req, clientError, next);
    clientError.emitFinish();
    expect(increment).not.toHaveBeenCalledWith("http.request.errors", expect.any(Object));
  });
});
