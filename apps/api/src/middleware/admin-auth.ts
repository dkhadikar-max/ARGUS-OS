import type { NextFunction, Request, Response } from "express";
import { AppError } from "@argus/shared";
import { env } from "../config/env.js";

/**
 * Guards the Argus-internal, cross-tenant Admin API (GET /api/v1/admin/*)
 * -- explicit email allowlist (ADMIN_EMAILS), not UserRole.ADMIN: that
 * enum value is declared in schema.prisma but never assigned to any real
 * user anywhere (no seed, no signup flow, no promotion endpoint -- the
 * only role ever auto-assigned is FOUNDER). Must run strictly after
 * requireAuth, which is what populates req.auth.email.
 *
 * Parses ADMIN_EMAILS fresh on every request rather than precomputing a
 * Set at module load -- the allowlist is a handful of emails, so
 * re-parsing is negligible, and this matches requireInternalService's own
 * env.INTERNAL_SERVICE_TOKEN pattern (the one other non-requireAuth gate
 * in this codebase), including staying trivially mockable/mutable per
 * test the same way internal-auth.test.ts already does.
 */
function parseAdminEmails(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const adminEmails = parseAdminEmails(env.ADMIN_EMAILS);
  if (adminEmails.size === 0) {
    next(new AppError("FORBIDDEN", "Admin access is not configured"));
    return;
  }

  // No email is normalized at write time anywhere in this codebase
  // (webhook.repository.ts writes Clerk's email verbatim) -- normalize
  // here on both sides rather than assuming consistent casing.
  const email = req.auth?.email?.toLowerCase();
  if (!email || !adminEmails.has(email)) {
    next(new AppError("FORBIDDEN", "Admin access required"));
    return;
  }

  next();
}
