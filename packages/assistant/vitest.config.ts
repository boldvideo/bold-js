import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts"],
      exclude: ["src/core/index.ts", "src/core/types.ts"],
      thresholds: { lines: 100, functions: 100, statements: 100, branches: 100 },
    },
  },
});
