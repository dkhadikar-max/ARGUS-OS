import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/argus_test",
      REDIS_URL: "redis://localhost:6379",
      ANTHROPIC_API_KEY: "sk-ant-test-key",
      CLERK_JWT_ISSUER: "https://test.clerk.accounts.dev",
      CLERK_JWKS_URL: "https://test.clerk.accounts.dev/.well-known/jwks.json",
      // 32 bytes of hex, a fixed value (not randomBytes) so encrypted
      // fixtures/snapshots stay reproducible across test runs.
      CONFIG_ENCRYPTION_KEY: "0".repeat(64),
    },
  },
});
