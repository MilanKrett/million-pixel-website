import { defineConfig } from "vitest/config";
import { resolve } from "./vitest.config.mjs";

/** Tests against a real Postgres: the local embedded server, database "pixelwall_test". */
export default defineConfig({
  resolve,
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
