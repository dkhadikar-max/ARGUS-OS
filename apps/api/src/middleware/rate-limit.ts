import type { NextFunction, Request, Response } from "express";
import { AppError } from "@argus/shared";
import { redis } from "../lib/redis.js";
import { env } from "../config/env.js";

const WINDOW_SECONDS = 3600; // Bible §19.1: "100 decisions/hour free, 500/hour paid"

/**
 * Fixed-window counter keyed `ratelimit:{teamId}:{api}` (Bible §9.2 Redis
 * schema). Limit is chosen by plan tier; PlanTier.FREE gets the free limit,
 * everything else gets the paid limit (Enterprise overrides are a §15.2
 * P2 feature — not needed until custom per-team limits ship).
 */
export function rateLimit(api: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) {
      next(new AppError("UNAUTHORIZED", "Authentication required"));
      return;
    }

    const limit =
      auth.planTier === "FREE"
        ? env.RATE_LIMIT_FREE_PER_HOUR
        : env.RATE_LIMIT_PAID_PER_HOUR;

    const key = `ratelimit:${auth.teamId}:${api}`;

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, WINDOW_SECONDS);
      }

      const ttl = await redis.ttl(key);
      const resetsAt = new Date(Date.now() + Math.max(ttl, 0) * 1000);

      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", Math.max(limit - count, 0));
      res.setHeader("X-RateLimit-Reset", resetsAt.toISOString());

      if (count > limit) {
        next(
          new AppError(
            "RATE_LIMITED",
            "Decision limit exceeded. Upgrade your plan or wait for the limit to reset.",
            undefined,
            { retryAfter: Math.max(ttl, 0), limit, remaining: 0, resetsAt: resetsAt.toISOString() },
          ),
        );
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
