import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      SLACK_BOT_TOKEN_PLACEHOLDER: "unused", // authorize() supplies real per-workspace tokens
      SLACK_APP_TOKEN: "xapp-test-token",
      SLACK_SIGNING_SECRET: "test-signing-secret",
      API_BASE_URL: "http://localhost:4000",
      INTERNAL_SERVICE_TOKEN: "test-internal-token",
      REDIS_URL: "redis://localhost:6379",
    },
  },
});
