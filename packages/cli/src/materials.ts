import type { Command } from "commander";
import type { Stats } from "node:fs";
import { readFile, lstat, realpath, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { applyMaterial, surfaceMaskFromRegions, materialError } from "@pixelforge/core";
import { propSurfaceMask } from "@pixelforge/geometry";
import { assertNoSymlinkPath } from "@pixelforge/exporters";
const report = (data: unknown) => process.stdout.write(JSON.stringify(data) + "\n");
export const surfaceSelection = (value?: string) => value === undefined ? undefined : value.split(",").map(v => v.trim());
export async function readMaterialInput(file: string, max = 2_097_152): Promise<unknown> {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) throw new Error(`Material input must be a regular JSON file up to ${max} bytes`);
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}
export async function materialContext(input: unknown, o: { sprite: string; mask?: string; surfaces?: string }) {
  return applyMaterial(await readMaterialInput(o.sprite, 67_108_864), input, o.mask ? await readMaterialInput(o.mask) : undefined, surfaceSelection(o.surfaces));
}
export function registerMaterialCommands(program: Command, atomicWrite: (file: string, data: string | Uint8Array) => Promise<void>) {
  const write = async (outputs: { file: string; data: unknown }[], inputs: string[], force = false) => {
    if (new Set(outputs.map(o => resolve(o.file).toLowerCase())).size !== outputs.length) throw new Error("Material outputs must differ");
    const sources = await Promise.all(inputs.map(async f => ({ path: (await realpath(f)).toLowerCase(), stat: await lstat(f) }))), seen: Stats[] = [];
    for (const { file } of outputs) {
      const target = resolve(file);
      await assertNoSymlinkPath(target);
      if (sources.some(s => s.path === target.toLowerCase())) throw new Error("Output cannot overwrite a material, mask or sprite input");
      try {
        const info = await lstat(target);
        if (sources.some(s => info.ino !== 0 && info.ino === s.stat.ino && info.dev === s.stat.dev)) throw new Error("Output aliases an input");
        if (seen.some(s => info.ino !== 0 && info.ino === s.ino && info.dev === s.dev)) throw new Error("Outputs alias each other");
        seen.push(info); if (!force) throw new Error("Output exists; use --force to replace selected output files");
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    for (const { file, data } of outputs) {
      const text = JSON.stringify(data, null, 2) + "\n";
      await mkdir(dirname(resolve(file)), { recursive: true });
      if (force) await atomicWrite(file, text); else await writeFile(file, text, { flag: "wx" });
    }
  };
  const material = program.command("material").description("Deterministic palette materials on explicit owned surfaces (v0.9.0)");
  material.command("mask").argument("<sprite>")
    .option("--parts <ids>", "Comma-separated existing prop shape IDs")
    .option("--regions <file>", "Explicit authored surfaceRegions JSON for ordinary sprites")
    .requiredOption("--out <file>", "Reusable surface mask JSON")
    .option("--force").option("--json")
    .action(async (sprite: string, o: { parts?: string; regions?: string; out: string; force?: boolean; json?: boolean }) => {
      if (Boolean(o.parts) === Boolean(o.regions)) throw new Error("Choose exactly one of --parts IDS or --regions FILE");
      const source = await readMaterialInput(sprite, 67_108_864);
      const result = o.regions ? surfaceMaskFromRegions(source, await readMaterialInput(o.regions)) : propSurfaceMask(source, surfaceSelection(o.parts)!);
      if (result.ok && "mask" in result) await write([{ file: o.out, data: result.mask }], [sprite, ...(o.regions ? [o.regions] : [])], o.force);
      if (o.json) report({ ok: result.ok, diagnostics: result.diagnostics, mask: "mask" in result ? result.mask : undefined, output: result.ok ? resolve(o.out) : undefined });
      else process.stdout.write(`${result.ok ? "OK" : "FAILED"}: surface mask\n` + result.diagnostics.map(d => `${d.severity} ${d.code}: ${d.message} ${d.suggestion}\n`).join(""));
      if (!result.ok) process.exitCode = 1;
    });
  material.command("apply").argument("<request>")
    .requiredOption("--sprite <file>").option("--mask <file>", "Explicit ownership mask (required for application)")
    .option("--surfaces <ids>", "Comma-separated surface IDs; default all surfaces explicitly declared by the mask")
    .option("--out <file>", "Editable derived sprite; omitted means read-only")
    .option("--operations-out <file>", "Existing setPixel operation batch")
    .option("--force").option("--json")
    .action(async (request: string, o: { sprite: string; mask?: string; surfaces?: string; out?: string; operationsOut?: string; force?: boolean; json?: boolean }) => {
      let result;
      try { result = await materialContext(await readMaterialInput(request), o); }
      catch (error) {
        result = { ok: false, operations: { version: "1.0", operations: [] }, diagnostics: [materialError("PF_MATERIAL_INPUT_INVALID", "$", error instanceof Error ? error.message : String(error), "Supply valid regular request/sprite/mask JSON files; use capability schemas.")] };
      }
      const outputs: { file: string; data: unknown }[] = [];
      const inputs = [request, o.sprite, ...(o.mask ? [o.mask] : [])];
      if (result.ok && "sprite" in result) {
        if (o.out) outputs.push({ file: o.out, data: result.sprite });
        if (o.operationsOut) outputs.push({ file: o.operationsOut, data: result.operations });
        await write(outputs, inputs, o.force);
      }
      const sourceFiles = result.ok ? await Promise.all(inputs.map(async file => ({ file: resolve(file), sha256: createHash("sha256").update(await readFile(file)).digest("hex") }))) : [];
      if (o.json) report({ ...result, sourceFiles, outputs: outputs.map(o => resolve(o.file)) });
      else process.stdout.write(`${result.ok ? "OK" : "FAILED"}: material; ${result.operations.operations.length} editable operations\n` + result.diagnostics.map(d => `${d.severity} ${d.code} ${d.path}: ${d.message} ${d.suggestion}\n`).join(""));
      if (!result.ok) process.exitCode = 1;
    });
}
