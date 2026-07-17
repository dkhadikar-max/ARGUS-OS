import type { NextFunction, Request, Response } from "express";
import { redis } from "../../lib/redis.js";
import { logger } from "../../lib/logger.js";

const WINDOW_SECONDS = 3600;
// Generous: this only guards against scripted spam, not real visitors --
// nobody clicks all three CTAs more than a handful of times in an hour.
const MAX_PER_IP_PER_HOUR = 20;

/**
 * POST /api/v1/leads has no auth (a marketing-site visitor isn't a signed-in
 * ARGUS user), so the team-scoped rateLimit middleware (middleware/
 * rate-limit.ts, keyed on req.auth) doesn't apply here -- this is the same
 * fixed-window-counter approach, keyed by IP instead of team. Best-effort:
 * a Redis hiccup logs and lets the request through rather than blocking a
 * real lead over an infra blip.
 */
export async function leadIpRateLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = req.ip ?? "unknown";
    const key = `ratelimit:lead:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }
    if (count > MAX_PER_IP_PER_HOUR) {
      res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } });
      return;
    }
    next();
  } catch (err) {
    logger.warn({ err }, "Lead rate limit check failed; allowing request through");
    next();
  }
}
