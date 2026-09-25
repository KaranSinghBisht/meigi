import { defineConfig } from "vitest/config";

/** Deploys the real contracts to a local anvil with forge, then pays and reverts through the HTTP API. */
export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 240_000,
    fileParallelism: false,
  },
});
