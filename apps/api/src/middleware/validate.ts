import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { AppError } from "@argus/shared";

type Source = "body" | "query" | "params";

/** Validates and replaces req[source] with the parsed (and defaulted) data. */
export function validate(schema: ZodSchema, source: Source = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      next(new AppError("VALIDATION_ERROR", "Invalid request data", details));
      return;
    }

    (req as unknown as Record<Source, unknown>)[source] = result.data;
    next();
  };
}
