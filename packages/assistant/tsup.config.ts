import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/core/index.ts", "src/server/index.ts", "src/testing/index.ts"],
  format: ["esm"],
  dts: true,
  target: "es2020",
  clean: true,
});
