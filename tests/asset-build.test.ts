import { it, expect } from "vitest";
import {
  mkdtemp,
  writeFile,
  readFile,
  stat,
  rm,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as pf from "../packages/core/src/index.js";
import { buildAssets } from "../packages/exporters/src/assets.js";
it("builds changed assets, skips exact fresh outputs, tracks batches/inputs/options and preserves runtime keys", async () => {
  const root = await mkdtemp(join(tmpdir(), "pf-assets-"));
  try {
    const p = pf.createProject({ name: "Asset", width: 4, height: 4 }),
      source = join(root, "hero.sprite.json"),
      file = join(root, "pixelforge.assets.json");
    await writeFile(source, pf.serializeProject(p));
    await writeFile(join(root, "other.sprite.json"), pf.serializeProject(p));
    await writeFile(join(root, "generator-input.txt"), "v1");
    await writeFile(
      join(root, "edits.json"),
      JSON.stringify({ version: "1.0", operations: [] }),
    );
    const manifest = {
      version: "1.0",
      assets: [
        {
          id: "hero",
          runtimeKey: "player",
          source: "hero.sprite.json",
          output: "public/generated/hero",
          operations: ["edits.json"],
          inputs: ["generator-input.txt"],
          options: { padding: 0 },
        },
        {
          id: "other",
          source: "other.sprite.json",
          output: "public/generated/other",
        },
      ],
    };
    await writeFile(file, JSON.stringify(manifest));
    expect((await buildAssets(file)).built).toBe(2);
    const png = join(root, "public/generated/hero/player.png"),
      time = (await stat(png)).mtimeMs;
    expect((await buildAssets(file)).skipped).toBe(2);
    expect((await stat(png)).mtimeMs).toBe(time);
    pf.setPixel(p, "frame-0", "base", 1, 1, 1);
    await writeFile(source, pf.serializeProject(p));
    const changed = await buildAssets(file);
    expect(changed.built).toBe(1);
    expect(changed.skipped).toBe(1);
    expect(changed.assets[0]?.runtimeKey).toBe("player");
    await writeFile(join(root, "generator-input.txt"), "v2");
    expect((await buildAssets(file)).built).toBe(1);
    await writeFile(
      join(root, "edits.json"),
      JSON.stringify({
        version: "1.0",
        operations: [
          {
            op: "setPixel",
            frame: "frame-0",
            layer: "base",
            x: 0,
            y: 0,
            color: 1,
          },
        ],
      }),
    );
    expect((await buildAssets(file)).built).toBe(1);
    manifest.assets[0]!.options!.padding = 1;
    await writeFile(file, JSON.stringify(manifest));
    expect((await buildAssets(file)).built).toBe(1);
    await writeFile(png, "modified");
    await expect(buildAssets(file)).rejects.toThrow(/changed/);
    expect(await readFile(png, "utf8")).toBe("modified");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("rejects manifests, escapes, missing sources, overlapping outputs and outputs containing inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "pf-manifest-"));
  try {
    const file = join(root, "pixelforge.assets.json"),
      p = pf.createProject({ name: "Test", width: 2, height: 2 });
    await writeFile(join(root, "source.json"), pf.serializeProject(p));
    const run = async (assets: unknown[]) => {
      await writeFile(file, JSON.stringify({ version: "1.0", assets }));
      return buildAssets(file);
    };
    await expect(
      run([{ id: "x", source: "../escape.json", output: "out" }]),
    ).rejects.toThrow(/relative|escapes/);
    await expect(
      run([{ id: "x", source: "source.json", output: "con" }]),
    ).rejects.toThrow(/relative/);
    await expect(
      run([{ id: "x", source: "source.json", output: "folder." }]),
    ).rejects.toThrow(/relative/);
    await expect(
      run([{ id: "x", source: "missing.json", output: "out" }]),
    ).rejects.toThrow();
    await expect(
      run([
        { id: "x", source: "source.json", output: "folder" },
        { id: "y", source: "source.json", output: "folder/nested" },
      ]),
    ).rejects.toThrow(/overlap/);
    await mkdir(join(root, "sources"));
    await writeFile(join(root, "sources/source.json"), pf.serializeProject(p));
    await expect(
      run([{ id: "x", source: "sources/source.json", output: "sources" }]),
    ).rejects.toThrow(/input/);
    await expect(
      run([{ id: "x", source: "source.json", output: "../escape" }]),
    ).rejects.toThrow(/relative|escapes/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
