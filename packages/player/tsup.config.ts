import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  target: "es2020",
  clean: true,
  // The player uses hooks and browser APIs; Next.js needs to be told.
  banner: { js: '"use client";' },
});
