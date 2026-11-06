import { it, expect } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";

it("audio CLI edits atomically, renders WAV and protects managed/user files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pf-audio-cli-"));
  const run = (...args: string[]) =>
    promisify(execFile)(
      process.execPath,
      [
        "--conditions=development",
        "--import",
        pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href,
        resolve("packages/cli/src/index.ts"),
        "audio",
        ...args,
      ],
      { cwd: dir, timeout: 20000 },
    );
  try {
    await run("create", "laser", "--output", "laser.sound.json");
    const original = await readFile(join(dir, "laser.sound.json"), "utf8");
    const inspected = JSON.parse(
      (await run("inspect", "laser.sound.json", "--metrics")).stdout,
    );
    expect(inspected.metrics.silent).toBe(false);
    expect(inspected.pcm).toBeUndefined();
    await run("validate", "laser.sound.json", "--render");
    await run("render", "laser.sound.json", "--output", "laser.wav");
    expect(
      (await readFile(join(dir, "laser.wav"))).subarray(0, 4).toString(),
    ).toBe("RIFF");
    await expect(
      run("render", "laser.sound.json", "--output", "laser.sound.json"),
    ).rejects.toThrow(/source/);
    await writeFile(
      join(dir, "edits.json"),
      JSON.stringify([
        { op: "setSeed", seed: 22 },
        { op: "removeVoice", id: "missing" },
      ]),
    );
    await expect(
      run(
        "apply",
        "laser.sound.json",
        "--operations",
        "edits.json",
        "--output",
        "laser.sound.json",
      ),
    ).rejects.toThrow(/missing/);
    expect(await readFile(join(dir, "laser.sound.json"), "utf8")).toBe(
      original,
    );
    await run("export", "laser.sound.json", "--output", "bundle");
    const manifest = JSON.parse(
      await readFile(join(dir, "bundle/audio.json"), "utf8"),
    );
    expect(manifest.assets[0].file).toBe("laser-shot.wav");
    await expect(
      run("export", "laser.sound.json", "--output", "bundle"),
    ).rejects.toThrow(/exists/);
    await run("export", "laser.sound.json", "--output", "bundle", "--replace");
    await writeFile(join(dir, "bundle/user.txt"), "keep");
    await expect(
      run("export", "laser.sound.json", "--output", "bundle", "--replace"),
    ).rejects.toThrow(/user files/);
    expect(await readFile(join(dir, "bundle/user.txt"), "utf8")).toBe("keep");
    expect(await readFile(join(dir, "laser.sound.json"), "utf8")).toBe(
      original,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 60000);
