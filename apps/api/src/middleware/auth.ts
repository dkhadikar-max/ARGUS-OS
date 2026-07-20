import type { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import { AppError } from "@argus/shared";
import { prisma } from "@argus/database";
import type { PlanTier, UserRole } from "@argus/database";
import { env } from "../config/env.js";

export interface AuthContext {
  type: "user" | "api_key";
  userId?: string;
  role?: UserRole;
  teamId: string;
  planTier: PlanTier;
  apiKeyId?: string;
}

/** Roles allowed to change team-wide state (Slack connect, ICP editing,
 *  etc.) — everything narrower than an individual rep's own account. */
export const ADMIN_ROLES = new Set<UserRole>(["ADMIN", "FOUNDER", "MANAGER"]);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const jwks = env.CLERK_JWKS_URL
  ? createRemoteJWKSet(new URL(env.CLERK_JWKS_URL))
  : null;

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

async function authenticateWithApiKey(
  apiKey: string,
  actingUserId?: string,
): Promise<AuthContext> {
  const keyHash = hashApiKey(apiKey);
  const record = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { team: true },
  });

  if (!record || record.revokedAt) {
    throw new AppError("UNAUTHORIZED", "Invalid or revoked API key");
  }

  await prisma.apiKey.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  const base: AuthContext = {
    type: "api_key",
    teamId: record.teamId,
    planTier: record.team.plan,
    apiKeyId: record.id,
  };

  if (!actingUserId) {
    return base;
  }

  // Bible §10.1 only specifies team-scoped API keys, but the Slack Bot
  // (§18 Epic 3) must attribute overrides/outcomes to the specific rep who
  // clicked a Slack button, not just "the team". Rather than inventing a
  // second auth scheme, a team-scoped API key may additionally assert an
  // acting user via x-acting-user-id — honored only after confirming that
  // user actually belongs to the same team this key is scoped to, which
  // keeps one workspace's key from impersonating another team's user.
  const actingUser = await prisma.user.findFirst({
    where: { id: actingUserId, teamId: record.teamId },
  });
  if (!actingUser) {
    throw new AppError(
      "FORBIDDEN",
      "x-acting-user-id does not belong to the team this API key is scoped to",
    );
  }

  return { ...base, userId: actingUser.id, role: actingUser.role };
}

/** Exported for lib/websocket.ts: Bible §10.6's `wss://.../ws?token={jwt}`
 *  handshake authenticates with the same Clerk JWT as REST's Bearer scheme,
 *  so the verification logic itself must not be duplicated. */
export async function authenticateWithJwt(token: string): Promise<AuthContext> {
  if (!jwks || !env.CLERK_JWT_ISSUER) {
    throw new AppError(
      "UNAUTHORIZED",
      "JWT authentication is not configured on this server",
    );
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, { issuer: env.CLERK_JWT_ISSUER }));
  } catch (err) {
    // jose throws its own error classes here. The token-invalid ones
    // (JWTExpired, JWSSignatureVerificationFailed, JWTClaimValidationFailed,
    // ...) are Clerk's ~60s session token expiring -- the single most common
    // failure mode a real client will hit -- and must become a 401 so
    // callers (the extension's background worker included) that specifically
    // check for 401 to clear a stale cached token actually see it. But
    // createRemoteJWKSet fetches Clerk's signing keys lazily over the
    // network on every call, and a genuine infra failure there (JWKS
    // endpoint down/timing out, or a plain network error) throws too --
    // converting *that* to the same 401 would make every request during a
    // Clerk outage look like "your session expired" and wrongly clear every
    // active user's still-valid token. Only the token-content error classes
    // below are treated as an auth failure; anything else re-throws as-is,
    // surfacing correctly as a 500.
    const isTokenInvalid =
      err instanceof errors.JWTExpired ||
      err instanceof errors.JWTClaimValidationFailed ||
      err instanceof errors.JWTInvalid ||
      err instanceof errors.JWSSignatureVerificationFailed ||
      err instanceof errors.JWSInvalid ||
      err instanceof errors.JOSEAlgNotAllowed;
    if (!isTokenInvalid) throw err;
    throw new AppError("UNAUTHORIZED", "Invalid or expired token");
  }

  const userId = payload.sub;
  if (!userId) {
    throw new AppError("UNAUTHORIZED", "Token missing subject claim");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { team: true },
  });

  if (!user || !user.team) {
    throw new AppError("FORBIDDEN", "User is not associated with a team");
  }

  return {
    type: "user",
    userId: user.id,
    role: user.role,
    teamId: user.team.id,
    planTier: user.team.plan,
  };
}

/** Bible §10.1: Bearer {clerk_jwt} OR x-api-key header. */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const apiKeyHeader = req.header("x-api-key");
    const authHeader = req.header("authorization");

    if (apiKeyHeader) {
      req.auth = await authenticateWithApiKey(
        apiKeyHeader,
        req.header("x-acting-user-id") ?? undefined,
      );
    } else if (authHeader?.startsWith("Bearer ")) {
      req.auth = await authenticateWithJwt(authHeader.slice("Bearer ".length));
    } else {
      throw new AppError(
        "UNAUTHORIZED",
        "Missing Authorization Bearer token or x-api-key header",
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}
