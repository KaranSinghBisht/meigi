import { defineConfig } from "vitest/config";

/** Unit tests: fakes only, no network, no chain. The anvil test lives in vitest.integration.config.ts. */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/integration/**", "node_modules/**"],
  },
});
