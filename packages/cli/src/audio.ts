import type { Command } from "commander";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { assertNoSymlinkPath } from "@pixelforge/exporters";
import {
  applyAudioOperations,
  audioOperationsSchema,
  audioPresetNames,
  createSound,
  parseSound,
  renderSound,
  serializeSound,
  type AudioPresetName,
} from "@pixelforge/audio-core";
import { encodeWav } from "@pixelforge/audio-exporters";
import { exportAudioBundle } from "./audio-bundle.js";

export function registerAudioCommands(
  program: Command,
  atomicWrite: (file: string, data: string | Uint8Array) => Promise<void>,
): void {
  const report = (data: unknown): void => {
    process.stdout.write(JSON.stringify(data) + "\n");
  };
  const json = async (file: string): Promise<unknown> => {
    if ((await stat(file)).size > 1_048_576)
      throw new Error("Audio JSON exceeds 1 MiB");
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  };
  const write = async (
    file: string,
    data: string | Uint8Array,
    source?: string,
  ) => {
    if (
      source &&
      resolve(source).toLowerCase() === resolve(file).toLowerCase() &&
      data instanceof Uint8Array
    )
      throw new Error("WAV output cannot replace sound source");
    await assertNoSymlinkPath(resolve(file));
    await atomicWrite(file, data);
  };
  const audio = program
    .command("audio")
    .description(
      "Create, inspect and render editable procedural sound projects",
    );
  audio
    .command("create")
    .argument("<name>")
    .option("--preset <name>", audioPresetNames.join(", "), "laser-shot")
    .requiredOption("-o, --output <file>")
    .action(async (name: string, o: { preset: string; output: string }) => {
      if (!audioPresetNames.includes(o.preset as AudioPresetName))
        throw new Error("Unknown audio preset");
      await write(
        o.output,
        serializeSound(createSound(name, o.preset as AudioPresetName)),
      );
      report({ ok: true, output: o.output });
    });
  audio
    .command("inspect")
    .argument("<file>")
    .option("--metrics", "Render and include peak/RMS")
    .action(async (file: string, o: { metrics?: boolean }) => {
      const p = parseSound(await json(file));
      report({
        id: p.id,
        name: p.name,
        durationMs: p.durationMs,
        sampleRate: p.sampleRate,
        seed: p.seed,
        voices: p.voices,
        effects: p.effects,
        ...(o.metrics ? { metrics: renderSound(p).metrics } : {}),
      });
    });
  audio
    .command("validate")
    .argument("<file>")
    .option("--render", "Also check synthesis stability and clipping")
    .action(async (file: string, o: { render?: boolean }) => {
      const p = parseSound(await json(file));
      report({
        ok: true,
        samples: Math.round((p.durationMs * p.sampleRate) / 1000),
        pcmBytes: Math.round((p.durationMs * p.sampleRate) / 1000) * 8,
        ...(o.render ? { metrics: renderSound(p).metrics } : {}),
      });
    });
  audio
    .command("render")
    .argument("<file>")
    .requiredOption("-o, --output <file>")
    .description("Write canonical mono PCM16 WAV")
    .action(async (file: string, o: { output: string }) => {
      const result = renderSound(await json(file));
      await write(
        o.output,
        encodeWav(result.pcm, result.project.sampleRate),
        file,
      );
      report({ ok: true, output: o.output, metrics: result.metrics });
    });
  audio
    .command("export")
    .argument("<file>")
    .requiredOption("-o, --output <directory>")
    .option("--replace", "Replace verified unchanged managed output")
    .description("Export WAV, editable source and Phaser audio manifest")
    .action(async (file: string, o: { output: string; replace?: boolean }) => {
      report({
        ok: true,
        ...(await exportAudioBundle(await json(file), o.output, o.replace)),
      });
    });
  audio
    .command("apply")
    .argument("<file>")
    .requiredOption("--operations <file>")
    .requiredOption("-o, --output <file>")
    .action(async (file: string, o: { operations: string; output: string }) => {
      const result = applyAudioOperations(
        await json(file),
        await json(o.operations),
      );
      await write(o.output, serializeSound(result));
      report({ ok: true, output: o.output });
    });
  const operations = audio.command("operations");
  operations
    .command("list")
    .action(() =>
      report({
        operations: audioOperationsSchema.element.options.map(
          (option) => option.shape.op.value,
        ),
      }),
    );
  operations
    .command("describe")
    .argument("<name>")
    .action((name: string) => {
      const schema = audioOperationsSchema.element.options.find(
        (option) => option.shape.op.value === name,
      );
      if (!schema) throw new Error(`Unknown audio operation ${name}`);
      report({ name, schema: schema.toJSONSchema() });
    });
}
