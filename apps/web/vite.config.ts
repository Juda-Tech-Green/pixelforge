import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        audio: fileURLToPath(new URL("./audio.html", import.meta.url)),
        audioGame: fileURLToPath(new URL("./audio-game.html", import.meta.url)),
        phaser: fileURLToPath(new URL("./phaser.html", import.meta.url)),
      },
    },
  },
  resolve: {
    alias: {
      "@pixelforge/audio-core": fileURLToPath(new URL("../../packages/audio-core/src/index.ts", import.meta.url)),
      "@pixelforge/audio-exporters": fileURLToPath(new URL("../../packages/audio-exporters/src/index.ts", import.meta.url)),
      "@pixelforge/core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
    },
  },
});
