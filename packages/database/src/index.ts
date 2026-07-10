import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __argusPrisma: PrismaClient | undefined;
}

// Singleton pattern: prevents exhausting the Postgres connection pool when
// the API process hot-reloads in development (each reload would otherwise
// instantiate a new PrismaClient without closing the previous one).
export const prisma = globalThis.__argusPrisma ?? new PrismaClient();

if (process.env["NODE_ENV"] !== "production") {
  globalThis.__argusPrisma = prisma;
}

export * from "@prisma/client";
