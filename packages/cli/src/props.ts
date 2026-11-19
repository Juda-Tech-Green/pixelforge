import type { Command } from "commander";
import type { Stats } from "node:fs";
import { lstat, readFile, realpath, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { createProp, resolveProp, propTypes, type PropType } from "@pixelforge/geometry";
import { assertNoSymlinkPath } from "@pixelforge/exporters";

const report = (data: unknown) => process.stdout.write(JSON.stringify(data) + "\n");
export function registerPropCommands(program: Command, atomicWrite: (file: string, data: string | Uint8Array) => Promise<void>) {
  const write = async (outputs: { file: string; data: unknown }[], force: boolean, source?: string) => {
    if (new Set(outputs.map(o => resolve(o.file).toLowerCase())).size !== outputs.length) throw new Error("Prop outputs must differ");
    const original = source ? { path: (await realpath(source)).toLowerCase(), stat: await lstat(source) } : undefined;
    const existing: Stats[] = [];
    // Preflight every destination before writing any of them.
    for (const { file } of outputs) {
      const target = resolve(file);
      await assertNoSymlinkPath(target);
      if (original?.path === target.toLowerCase()) throw new Error("Output cannot overwrite the prop source");
      try {
        const info = await lstat(target);
        if (original && info.ino !== 0 && info.ino === original.stat.ino && info.dev === original.stat.dev) throw new Error("Output aliases the prop source");
        if (existing.some(p => info.ino !== 0 && p.ino === info.ino && p.dev === info.dev)) throw new Error("Prop outputs alias each other");
        existing.push(info);
        if (!force) throw new Error("Output exists; use --force only to replace the selected output");
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    for (const { file, data } of outputs) {
      const text = JSON.stringify(data, null, 2) + "\n";
      await mkdir(dirname(resolve(file)), { recursive: true });
      if (force) await atomicWrite(file, text); else await writeFile(file, text, { flag: "wx" });
    }
  };
  const prop = program.command("prop").description("Compile opt-in parametric props through existing geometry (v0.9.0)");
  prop.command("create").argument("<id>").requiredOption("--type <type>", propTypes.join(", "))
    .requiredOption("-o, --out <file>", "Editable prop source JSON")
    .option("--force").option("--json", "JSON summary (also the default)")
    .action(async (id: string, o: { type: string; out: string; force?: boolean }) => {
      if (!propTypes.includes(o.type as PropType)) throw new Error(`Choose --type ${propTypes.join("|")}`);
      const source = createProp(o.type as PropType, id);
      await write([{ file: o.out, data: source }], Boolean(o.force));
      report({ ok: true, output: resolve(o.out), component: source.component.type, format: source.format, version: source.version,
        next: "Edit parameters/palette roles, doctor the source, then prop resolve --out NEW.sprite.json" });
    });
  prop.command("resolve").argument("<request>")
    .option("-o, --out <file>", "Write ordinary editable sprite JSON; omitted is read-only")
    .option("--out-rig <file>", "Optional existing-schema editable rig JSON")
    .option("--force", "Replace selected outputs, protecting source aliases")
    .option("--json", "Include source, rig, pose, sprite, anchors and diagnostics")
    .action(async (request: string, o: { out?: string; outRig?: string; force?: boolean; json?: boolean }) => {
      let bytes: Buffer, input: unknown;
      try {
        const info = await lstat(request);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 2_097_152) throw new Error("Prop input must be a regular JSON file up to 2MiB");
        bytes = await readFile(request); input = JSON.parse(bytes.toString("utf8")) as unknown;
      } catch (error) {
        const data = { ok: false, diagnostics: [{ code: "PF_PROP_INPUT_INVALID", severity: "error", path: "$", message: error instanceof Error ? error.message : String(error),
          suggestion: "Supply a regular valid prop JSON file; discover syntax with capabilities --schema prop." }], outputs: [] };
        if (o.json) report(data); else process.stdout.write(data.diagnostics[0]!.message + "\n");
        process.exitCode = 1; return;
      }
      const result = resolveProp(input), outputs: { file: string; data: unknown }[] = [];
      if (result.ok) {
        if (o.out) outputs.push({ file: o.out, data: result.sprite });
        if (o.outRig) outputs.push({ file: o.outRig, data: result.rig });
        await write(outputs, Boolean(o.force), request);
      }
      const provenance = { source: resolve(request), sha256: createHash("sha256").update(bytes).digest("hex") };
      if (o.json) report({ ...result, provenance, outputs: outputs.map(o => resolve(o.file)) });
      else process.stdout.write(`${result.ok ? "OK" : "FAILED"}: parametric prop\n` + result.diagnostics.map(d => `${d.severity} ${d.code} ${d.path}: ${d.message} ${d.suggestion}\n`).join("") +
        (result.ok ? `Canvas: ${result.rig!.canvas.width}x${result.rig!.canvas.height}; ${result.rig!.shapes.length} existing editable shapes\n` : "") +
        (outputs.length ? outputs.map(o => `Output: ${resolve(o.file)}\n`).join("") : "Read-only; use --json to inspect editable output.\n"));
      if (!result.ok) process.exitCode = 1;
    });
}
