#!/usr/bin/env node
import {
  exportPhaserBundle,
  exportContactSheet,
  buildAssets,
  type ContactOptions,
} from "@pixelforge/exporters";
import { Command, InvalidArgumentError } from "commander";
import { readFile, writeFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve, join, parse } from "node:path";
import { randomUUID } from "node:crypto";
import {
  createProject,
  fromDocument,
  serializeProject,
  applyOperations,
  getAnimation,
  inspectProject,
  listOperations,
  describeOperation,
  colorSchema,
  diffProjects,
  checkSemantics,
  operationsSchema,
  sharedFrameUses,
} from "@pixelforge/core";
import { z } from "zod";
import { registerAudioCommands } from "./audio.js";
import { registerGeometryCommands } from "./geometry.js";
import { exportFramePNG, exportSpriteSheet } from "@pixelforge/exporters";
const program = new Command()
  .name("pixelforge")
  .version("0.6.0")
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
  .option(
    "--palette <file>",
    "JSON array of RGBA byte tuples; transparent index0",
  )
  .action(
    async (
      name: string,
      o: { width: number; height: number; output?: string; palette?: string },
    ) => {
      const file = o.output ?? `${name}.sprite.json`;
      await atomicWrite(
        file,
        serializeProject(
          createProject({
            name,
            width: o.width,
            height: o.height,
            ...(o.palette
              ? {
                  palette: z
                    .array(colorSchema)
                    .min(1)
                    .max(256)
                    .parse(await readJSON(o.palette)),
                }
              : {}),
          }),
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
  .option("--summary", "Compact summary (default)")
  .option("--animation <name>")
  .option("--frame <id>")
  .option("--layer <id>")
  .option("--game")
  .option("--palette", "Paged palette indices and RGBA values")
  .option("--frames", "Paged source frame identifiers")
  .option("--json", "JSON output (default)")
  .option("--limit <count>", "Page size1..100", integer, 25)
  .option("--offset <count>", "Page offset", integer, 0)
  .action(
    async (
      file: string,
      o: {
        animation?: string;
        frame?: string;
        layer?: string;
        game?: boolean;
        palette?: boolean;
        frames?: boolean;
        limit: number;
        offset: number;
      },
    ) => {
      const p = await load(file);
      if (
        [o.animation, o.frame, o.layer, o.game, o.palette, o.frames].filter(
          Boolean,
        ).length > 1
      )
        throw new Error("Choose one inspection selector");
      report(inspectProject(p, { ...o, sourceBytes: (await stat(file)).size }));
    },
  );
const operations = program
  .command("operations")
  .description("Discover authoritative operation syntax");
program
  .command("build-assets")
  .requiredOption("--manifest <file>", "Project asset manifest")
  .action(async (o: { manifest: string }) => {
    report(await buildAssets(o.manifest));
  });
operations
  .command("list")
  .option("--json")
  .action(() => {
    report({ operations: listOperations() });
  });
operations
  .command("describe")
  .argument("<name>")
  .option("--example", "Print only a minimal schema-valid operation")
  .option("--json")
  .action((name: string, o: { example?: boolean }) => {
    const description = describeOperation(name);
    report(o.example ? description.example : description);
  });
program
  .command("diff")
  .argument("<before>")
  .argument("<after>")
  .option("--summary")
  .option("--json")
  .option("--limit <count>", "Maximum reported changes1..100", integer, 25)
  .option("--preserve-frames <ids>", "Comma-separated source frame IDs")
  .option("--preserve-layers <ids>", "Comma-separated layer IDs")
  .option("--preserve-game", "Assert unchanged game metadata")
  .action(
    async (
      before: string,
      after: string,
      o: {
        limit: number;
        preserveFrames?: string;
        preserveLayers?: string;
        preserveGame?: boolean;
      },
    ) => {
      const result = diffProjects(await load(before), await load(after), {
        limit: o.limit,
        preserveFrames: o.preserveFrames?.split(","),
        preserveLayers: o.preserveLayers?.split(","),
        preserveGame: o.preserveGame,
      });
      report(result);
      if (!result.ok) process.exitCode = 1;
    },
  );
program
  .command("check")
  .argument("<file>")
  .requiredOption("--contract <file>", "Explicit semantic expectations JSON")
  .action(async (file: string, o: { contract: string }) => {
    try {
      const result = checkSemantics(
        await load(file),
        await readJSON(o.contract),
      );
      report(result);
      if (!result.ok) process.exitCode = 1;
    } catch (error) {
      report({
        ok: false,
        structuralErrors: [
          error instanceof Error ? error.message : String(error),
        ],
        semanticViolations: [],
        visualWarnings: [],
        intentionalExceptions: [],
        aestheticQualityVerified: false,
      });
      process.exitCode = 1;
    }
  });
program
  .command("contact")
  .argument("<file>")
  .requiredOption("-o, --output <png>")
  .option("--animations <names>", "Comma-separated animation names")
  .option("--prefix <prefix>", "Optional naming convention filter")
  .option("--columns <count>", "Cells per row1..32", integer, 4)
  .option("--scale <factor>", "Integer pixel scale1..16", integer, 4)
  .option("--background <mode>", "transparent or checkerboard", "transparent")
  .option("--start <entry>", "First selected entry per animation", integer, 0)
  .option("--end <entry>", "Exclusive ending entry per animation", integer)
  .action(
    async (
      file: string,
      o: Omit<ContactOptions, "animations"> & {
        animations?: string;
        output: string;
      },
    ) => {
      const result = await exportContactSheet(await load(file), {
        ...o,
        animations: o.animations?.split(","),
      });
      if (!o.output.endsWith(".png"))
        throw new Error("Contact output must end in .png");
      await atomicWrite(o.output, result.png);
      await atomicWrite(
        o.output.replace(/\.png$/, ".contact.json"),
        JSON.stringify(result.map, null, 2) + "\n",
      );
      report({
        ok: true,
        output: o.output,
        map: o.output.replace(/\.png$/, ".contact.json"),
        cells: result.map.cells.length,
      });
    },
  );
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
  .option("--replace", "Replace a verified, unchanged managed Phaser bundle")
  .action(
    async (
      file: string,
      o: {
        layout: "atlas" | "spritesheet";
        name: string;
        maxWidth: number;
        maxHeight: number;
        powerOfTwo?: boolean;
        replace?: boolean;
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
          replace: o.replace,
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
    const original = await load(file),
      batch = operationsSchema.parse(await readJSON(o.operations));
    const touched = new Set(
      batch.operations.flatMap((operation) =>
        "frame" in operation ? [operation.frame] : [],
      ),
    );
    const warnings = [...touched].flatMap((frame) => {
      const uses = sharedFrameUses(original, frame);
      return uses.length > 1
        ? [
            {
              frame,
              referenceCount: uses.length,
              animations: [...new Set(uses.map((use) => use.animation))].slice(
                0,
                25,
              ),
              message:
                "Shared source edit affects multiple entries; duplicate and retarget for sequence-specific changes",
            },
          ]
        : [];
    });
    const p = applyOperations(original, batch);
    await atomicWrite(o.output, serializeProject(p));
    report({
      ok: true,
      output: o.output,
      warnings: warnings.slice(0, 25),
      warningsTotal: warnings.length,
    });
  });
registerAudioCommands(program, atomicWrite);
registerGeometryCommands(program, atomicWrite);
program.parseAsync().catch((error: unknown) => {
  process.stderr.write(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }) + "\n",
  );
  process.exitCode = 1;
});
