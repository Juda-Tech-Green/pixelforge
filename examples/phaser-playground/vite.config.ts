import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@pixelforge/core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
      "@pixelforge/phaser": fileURLToPath(
        new URL("../../packages/phaser/src/index.ts", import.meta.url),
      ),
    },
  },
});
