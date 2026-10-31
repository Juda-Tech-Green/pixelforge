import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        phaser: fileURLToPath(new URL("./phaser.html", import.meta.url)),
      },
    },
  },
  resolve: {
    alias: {
      "@pixelforge/core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
    },
  },
});
