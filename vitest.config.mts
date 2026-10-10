import path from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export const resolve = {
  alias: {
    "@": path.resolve(root, "src"),
    // server-only throws outside React Server Components; tests run in plain Node.
    "server-only": path.resolve(root, "tests/stubs/server-only.ts"),
  },
};

export default defineConfig({
  resolve,
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
