import { defineConfig } from "vitest/config";
import * as path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Unit tests live next to the code (src/**), in __tests__/, and alongside the
    // E2E harness scripts (scripts/**). The live Obsidian E2E suite under
    // tests/e2e/ has its own config (vitest.e2e.config.ts) and is excluded here.
    include: [
      "src/**/*.test.ts",
      "__tests__/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    exclude: ["node_modules/**", "tests/e2e/**"],
  },
  resolve: {
    alias: {
      obsidian: path.resolve("./tests/obsidian-stub.ts"),
    },
  },
});
