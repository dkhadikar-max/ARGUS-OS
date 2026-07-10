import type { NextFunction, Request, Response } from "express";
import { AppError, ERROR_CODE_HTTP_STATUS, type ApiError } from "@argus/shared";
import { logger } from "../lib/logger.js";

/** Bible §10.7 — every non-2xx response uses this envelope and code table. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    const status = ERROR_CODE_HTTP_STATUS[err.code];
    const body: ApiError = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
        ...(err.extra as Partial<ApiError["error"]>),
      },
    };
    if (status >= 500) {
      logger.error({ err, path: req.path }, "Request failed with server error");
    }
    res.status(status).json(body);
    return;
  }

  // Truly unexpected exceptions (bugs, DB outages, etc.) fall outside the
  // Bible §10.7 error taxonomy, which only enumerates *expected* API error
  // states. Respond honestly with a 500 rather than mislabeling this as one
  // of the documented codes (e.g. AI_UNAVAILABLE would be misleading if the
  // failure had nothing to do with Claude).
  logger.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred. Please try again.",
    },
  });
}
