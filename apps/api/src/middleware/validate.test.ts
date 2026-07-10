import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Request, Response } from "express";
import { AppError } from "@argus/shared";
import { validate } from "./validate.js";

const schema = z.object({
  name: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

describe("validate", () => {
  it("replaces req.body with the parsed (defaulted) data on success", () => {
    const req = { body: { name: "Sarah" } } as Request;
    const next = vi.fn();

    validate(schema)(req, {} as Response, next);

    expect(req.body).toEqual({ name: "Sarah", limit: 20 });
    expect(next).toHaveBeenCalledWith();
  });

  it("calls next with a VALIDATION_ERROR AppError on failure", () => {
    const req = { body: { limit: 999 } } as Request;
    const next = vi.fn();

    validate(schema)(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]?.[0];
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("VALIDATION_ERROR");
    expect((err as AppError).details?.length).toBeGreaterThan(0);
  });

  it("validates req.query when source is 'query'", () => {
    const req = { query: { name: "Alex", limit: "5" } } as unknown as Request;
    const next = vi.fn();

    validate(schema, "query")(req, {} as Response, next);

    expect(req.query).toEqual({ name: "Alex", limit: 5 });
  });
});
