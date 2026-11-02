import { it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const exec = promisify(execFile),
  cli = (...args: string[]) =>
    exec(process.execPath, [
      "--conditions=development",
      "--import",
      "tsx",
      resolve("packages/cli/src/index.ts"),
      ...args,
    ]);
it("runs palette initialization, discovery, selectors, diff, semantic check, contact and managed incremental commands", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pf-agent-cli-"));
  try {
    const source = join(dir, "hero.json"),
      palette = join(dir, "palette.json");
    await writeFile(
      palette,
      JSON.stringify([
        [0, 0, 0, 0],
        [10, 60, 130, 255],
      ]),
    );
    await cli(
      "init",
      "Hero",
      "--palette",
      palette,
      "--width",
      "4",
      "--height",
      "4",
      "--output",
      source,
    );
    expect(JSON.parse(await readFile(source, "utf8")).palette[1]).toEqual([
      10, 60, 130, 255,
    ]);
    const original = await readFile(source, "utf8");
    await writeFile(palette, JSON.stringify([[1, 2, 3, 255]]));
    await expect(
      cli("init", "Bad", "--palette", palette, "--output", source),
    ).rejects.toMatchObject({ code: 1 });
    expect(await readFile(source, "utf8")).toBe(original);
    const list = JSON.parse((await cli("operations", "list")).stdout);
    expect(list.operations).toContain("setAnchor");
    const operation = JSON.parse(
      (await cli("operations", "describe", "drawRect", "--example")).stdout,
    );
    operation.width = 2;
    operation.height = 2;
    operation.color = 1;
    await writeFile(
      join(dir, "ops.json"),
      JSON.stringify({
        version: "1.0",
        operations: [
          operation,
          {
            op: "addAnimation",
            name: "idle",
            loop: true,
            frames: [{ frameId: "frame-0", durationMs: 125 }],
          },
        ],
      }),
    );
    const after = join(dir, "after.json");
    await cli(
      "apply",
      source,
      "--operations",
      join(dir, "ops.json"),
      "--output",
      after,
    );
    for (const selector of [
      ["--summary"],
      ["--palette"],
      ["--frames"],
      ["--animation", "idle"],
      ["--layer", "base"],
      ["--frame", "frame-0"],
      ["--game"],
    ])
      expect(
        (await cli("inspect", after, ...selector)).stdout.length,
      ).toBeLessThan(32768);
    const diff = JSON.parse(
      (await cli("diff", source, after, "--summary", "--preserve-game")).stdout,
    );
    expect(diff.changedPixelCount).toBe(4);
    await expect(
      cli("diff", source, after, "--preserve-frames", "frame-0"),
    ).rejects.toMatchObject({ code: 1 });
    await writeFile(
      join(dir, "contract.json"),
      JSON.stringify({ version: "1.0", requiredAnimations: ["idle"] }),
    );
    expect(
      JSON.parse(
        (await cli("check", after, "--contract", join(dir, "contract.json")))
          .stdout,
      ).ok,
    ).toBe(true);
    await cli(
      "contact",
      after,
      "--animations",
      "idle",
      "--output",
      join(dir, "contact.png"),
    );
    expect(
      JSON.parse(await readFile(join(dir, "contact.contact.json"), "utf8"))
        .cells[0].frameId,
    ).toBe("frame-0");
    const manifest = join(dir, "assets.json");
    await writeFile(
      manifest,
      JSON.stringify({
        version: "1.0",
        assets: [{ id: "hero", source: "after.json", output: "generated" }],
      }),
    );
    expect(
      JSON.parse((await cli("build-assets", "--manifest", manifest)).stdout)
        .built,
    ).toBe(1);
    expect(
      JSON.parse((await cli("build-assets", "--manifest", manifest)).stdout)
        .skipped,
    ).toBe(1);
    await cli(
      "export",
      after,
      "--format",
      "phaser",
      "--output",
      join(dir, "generated"),
      "--replace",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 60_000);
