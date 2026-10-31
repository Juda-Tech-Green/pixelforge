#!/usr/bin/env node
import { exportPhaserBundle } from "@pixelforge/exporters";
import { Command, InvalidArgumentError } from "commander";
import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve, join, parse } from "node:path";
import { randomUUID } from "node:crypto";
import {
  createProject,
  fromDocument,
  serializeProject,
  applyOperations,
  getAnimation,
} from "@pixelforge/core";
import { exportFramePNG, exportSpriteSheet } from "@pixelforge/exporters";
const program = new Command()
  .name("pixelforge")
  .version("0.4.0")
  .description("Deterministic, editable pixel art for agents and humans");
const integer = (value: string) => {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new InvalidArgumentError("Expected a nonnegative integer");
  return Number(value);
};
const readJSON = async (file: string): Promise<unknown> =>
  JSON.parse(await readFile(file, "utf8")) as unknown;
const load = async (file: string) => fromDocument(await readJSON(file));
export async function atomicWrite(
  file: string,
  data: string | Uint8Array,
): Promise<void> {
  const target = resolve(file);
  await mkdir(dirname(target), { recursive: true });
  const temp = target + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temp, data, { flag: "wx" });
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
}
const report = (data: unknown) =>
  process.stdout.write(JSON.stringify(data) + "\n");
program
  .command("init")
  .argument("<name>")
  .option("--width <pixels>", "Canvas width", integer, 32)
  .option("--height <pixels>", "Canvas height", integer, 32)
  .option("-o, --output <file>")
  .action(
    async (
      name: string,
      o: { width: number; height: number; output?: string },
    ) => {
      const file = o.output ?? `${name}.sprite.json`;
      await atomicWrite(
        file,
        serializeProject(
          createProject({ name, width: o.width, height: o.height }),
        ),
      );
      report({ ok: true, output: file });
    },
  );
program
  .command("validate")
  .argument("<file>")
  .action(async (file: string) => {
    const p = await load(file);
    report({ ok: true, name: p.name, version: p.version });
  });
program
  .command("inspect")
  .argument("<file>")
  .action(async (file: string) => {
    const p = await load(file);
    report({
      name: p.name,
      version: p.version,
      width: p.width,
      height: p.height,
      palette: p.palette,
      layers: p.layers,
      frames: p.frames.map((f) => f.id),
      animations: p.animations,
    });
  });
program
  .command("render")
  .argument("<file>")
  .option("--animation <name>")
  .option(
    "--frame <index>",
    "Zero-based animation or project frame index",
    integer,
    0,
  )
  .requiredOption("-o, --output <file>")
  .action(
    async (
      file: string,
      o: { animation?: string; frame: number; output: string },
    ) => {
      const p = await load(file),
        id = o.animation
          ? getAnimation(p, o.animation).frames[o.frame]?.frameId
          : p.frames[o.frame]?.id;
      if (!id) throw new Error("Frame index outside sequence");
      await atomicWrite(o.output, await exportFramePNG(p, id));
      report({ ok: true, output: o.output, frameId: id });
    },
  );
program
  .command("export")
  .argument("<file>")
  .option("--format <format>", "spritesheet, frames or phaser", "spritesheet")
  .requiredOption("-o, --output <path>")
  .option("--columns <count>", "Defaults to a horizontal sheet", integer)
  .option("--padding <pixels>", "Transparent space between cells", integer, 0)
  .option("--layout <layout>", "Phaser atlas or spritesheet", "atlas")
  .option("--name <name>", "Filesystem-safe bundle basename", "character")
  .option("--max-width <pixels>", "Maximum atlas width", integer, 2048)
  .option("--max-height <pixels>", "Maximum atlas height", integer, 2048)
  .option("--power-of-two", "Power-of-two atlas dimensions")
  .action(
    async (
      file: string,
      o: {
        layout: "atlas" | "spritesheet";
        name: string;
        maxWidth: number;
        maxHeight: number;
        powerOfTwo?: boolean;
        format: string;
        output: string;
        columns?: number;
        padding: number;
      },
    ) => {
      const p = await load(file);
      if (o.format === "phaser") {
        const manifest = await exportPhaserBundle(p, o.output, {
          layout: o.layout,
          name: o.name,
          columns: o.columns,
          padding: o.padding,
          maxWidth: o.maxWidth,
          maxHeight: o.maxHeight,
          powerOfTwo: o.powerOfTwo,
        });
        report({ ok: true, output: o.output, manifest });
        return;
      }
      if (o.format === "frames") {
        await mkdir(o.output, { recursive: true });
        for (const [index, f] of p.frames.entries())
          await atomicWrite(
            join(o.output, `${index}.png`),
            await exportFramePNG(p, f.id),
          );
        report({ ok: true, output: o.output, frames: p.frames.length });
        return;
      }
      if (o.format !== "spritesheet")
        throw new Error("Format must be spritesheet, frames or phaser");
      const { png, manifest } = await exportSpriteSheet(p, {
        columns: o.columns,
        padding: o.padding,
      });
      const info = parse(o.output),
        json = join(info.dir, info.name + ".json");
      if (resolve(json) === resolve(o.output))
        throw new Error("Spritesheet output must use a PNG filename");
      await atomicWrite(o.output, png);
      await atomicWrite(json, JSON.stringify(manifest, null, 2) + "\n");
      report({ ok: true, output: o.output, manifest: json });
    },
  );
program
  .command("apply")
  .argument("<file>")
  .requiredOption("--operations <file>")
  .requiredOption("-o, --output <file>")
  .action(async (file: string, o: { operations: string; output: string }) => {
    const p = applyOperations(await load(file), await readJSON(o.operations));
    await atomicWrite(o.output, serializeProject(p));
    report({ ok: true, output: o.output });
  });
program.parseAsync().catch((error: unknown) => {
  process.stderr.write(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }) + "\n",
  );
  process.exitCode = 1;
});
