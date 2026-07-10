import type { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
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

async function authenticateWithApiKey(apiKey: string): Promise<AuthContext> {
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

  return {
    type: "api_key",
    teamId: record.teamId,
    planTier: record.team.plan,
    apiKeyId: record.id,
  };
}

async function authenticateWithJwt(token: string): Promise<AuthContext> {
  if (!jwks || !env.CLERK_JWT_ISSUER) {
    throw new AppError(
      "UNAUTHORIZED",
      "JWT authentication is not configured on this server",
    );
  }

  const { payload } = await jwtVerify(token, jwks, {
    issuer: env.CLERK_JWT_ISSUER,
  });

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
      req.auth = await authenticateWithApiKey(apiKeyHeader);
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
