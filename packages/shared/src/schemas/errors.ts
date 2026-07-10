import { z } from "zod";
import { errorCodeSchema } from "./enums.js";

// Bible §10.7 Error Codes — uniform envelope for all non-2xx API responses
export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional(),
    retryAfter: z.number().int().nonnegative().optional(),
    limit: z.number().int().nonnegative().optional(),
    remaining: z.number().int().nonnegative().optional(),
    resetsAt: z.string().datetime().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export class AppError extends Error {
  constructor(
    public readonly code: z.infer<typeof errorCodeSchema>,
    message: string,
    public readonly details?: { field: string; message: string }[],
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}
