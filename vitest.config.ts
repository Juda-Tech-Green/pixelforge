import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@pixelforge/audio-core": fileURLToPath(new URL("./packages/audio-core/src/index.ts", import.meta.url)),
      "@pixelforge/audio-exporters": fileURLToPath(new URL("./packages/audio-exporters/src/index.ts", import.meta.url)),
      "@pixelforge/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
    },
  },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000 },
});
