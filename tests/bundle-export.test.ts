import { it, expect } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import * as pf from "../packages/core/src/index.js";
import { exportPhaserBundle } from "../packages/exporters/src/bundle.js";
import sharp from "sharp";
it("stages complete bundles and preserves existing output/fails without partial files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pixelforge-bundle-"));
  try {
    const p = pf.createProject({ name: "Bundle", width: 4, height: 4 });
    const target = join(dir, "hero");
    await exportPhaserBundle(p, target, { name: "hero" });
    expect((await readdir(target)).sort()).toEqual([
      "README.md",
      "bundle.json",
      "hero.animations.json",
      "hero.atlas.json",
      "hero.game.json",
      "hero.png",
    ]);
    expect((await sharp(join(target, "hero.png")).metadata()).width).toBe(4);
    await expect(exportPhaserBundle(p, target)).rejects.toThrow(
      /already exists/,
    );
    await expect(
      exportPhaserBundle(p, join(dir, "bad"), { maxWidth: 1 }),
    ).rejects.toThrow(/fit/);
    expect(await readdir(dir)).toEqual(["hero"]);
    const run = promisify(execFile);
    await run(process.execPath, [
      "--conditions=development",
      "--import",
      "tsx",
      "packages/cli/src/index.ts",
      "export",
      "tests/fixtures/valid.sprite.json",
      "--format",
      "phaser",
      "--layout",
      "spritesheet",
      "--output",
      join(dir, "cli"),
      "--name",
      "dot",
      "--columns",
      "1",
    ]);
    expect(
      JSON.parse(await readFile(join(dir, "cli", "bundle.json"), "utf8"))
        .layout,
    ).toBe("spritesheet");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
