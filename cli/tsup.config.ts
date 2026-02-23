import { defineConfig } from "tsup";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  define: {
    PKG_VERSION: JSON.stringify(pkg.version),
  },
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
