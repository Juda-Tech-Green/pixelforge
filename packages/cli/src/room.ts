import type { Command } from "commander";
import type { Stats } from "node:fs";
import { readFile, lstat, realpath, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { roomSchema, resolveRoom, renderRoom, roomDiagnostic, type RoomResult, type RoomDiagnostic } from "@pixelforge/geometry";
import { assertNoSymlinkPath } from "@pixelforge/exporters";

export interface RoomFile { asset: string; source: string; path: string; sha256: string }
export interface RoomContext { result: RoomResult; inputs: string[]; sourceFiles: RoomFile[] }
/** Load exactly the declared references relative to the room file. No discovery, scanning or side-effectful generation. */
export async function roomContext(input: unknown, file: string): Promise<RoomContext> {
  const parsed = roomSchema.safeParse(input), inputs = [file], sourceFiles: RoomFile[] = [];
  if (!parsed.success) return { result: resolveRoom(input), inputs, sourceFiles };
  const supplied: Record<string, unknown> = Object.create(null) as Record<string, unknown>, diagnostics: RoomDiagnostic[] = [];
  let bytes = 0;
  for (const id of Object.keys(parsed.data.assets).sort()) {
    const decl = parsed.data.assets[id]!, path = resolve(dirname(resolve(file)), decl.source);
    try {
      const info = await lstat(path);
      bytes += info.size;
      if (!info.isFile() || info.isSymbolicLink() || info.size > 67_108_864 || bytes > 67_108_864) throw new Error("Room assets must be regular JSON files totaling at most64MiB");
      const data = await readFile(path);
      supplied[id] = JSON.parse(data.toString("utf8")) as unknown;
      inputs.push(path); sourceFiles.push({ asset: id, source: decl.source, path, sha256: createHash("sha256").update(data).digest("hex") });
    } catch (error) {
      diagnostics.push(roomDiagnostic("PF_ROOM_ASSET_MISSING", `$.assets.${id}.source`, error instanceof Error ? error.message : String(error), "Correct the explicitly declared path relative to the room file; use editable sprite JSON or declared type:prop."));
    }
  }
  if (diagnostics.length) return { result: { ok: false, diagnostics }, inputs, sourceFiles };
  const result = resolveRoom(input, supplied);
  return { result, inputs, sourceFiles };
}
export function registerRoomCommands(program: Command, atomicWrite: (file: string, data: string | Uint8Array) => Promise<void>) {
  program.command("room").description("Resolve semantic room anchors into existing scene1.0 (v0.9.0)")
    .command("resolve").argument("<request>")
    .option("--out <file>", "Existing-format scene manifest")
    .option("--sprite <file>", "Editable sprite derived through the existing scene renderer")
    .option("--mapping-out <file>", "Instance/source/position/anchor mappings and source file hashes")
    .option("--resources-out <file>", "Optional normalized resource snapshot map, once per asset")
    .option("--force", "Replace selected output files, protecting all source aliases")
    .option("--json", "Resolved scene, mappings, native resources and diagnostics")
    .action(async (request: string, o: { out?: string; sprite?: string; mappingOut?: string; resourcesOut?: string; force?: boolean; json?: boolean }) => {
      let context: RoomContext;
      try {
        const stat = await lstat(request);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_097_152) throw new Error("Room request must be a regular JSON file up to2MiB");
        context = await roomContext(JSON.parse(await readFile(request, "utf8")) as unknown, request);
      } catch (error) {
        context = { result: { ok: false, diagnostics: [roomDiagnostic("PF_ROOM_INPUT_INVALID", "$", error instanceof Error ? error.message : String(error), "Use a regular room JSON file and capabilities --schema room.")] }, inputs: [request], sourceFiles: [] };
      }
      const result = o.sprite && context.result.ok ? renderRoom(context.result) : context.result;
      const mapping = { room: result.room?.id, anchors: result.anchors, instances: result.instances, placementOrder: result.placementOrder, renderOrder: result.renderOrder,
        sourceFiles: context.sourceFiles, backgroundRegions: result.backgroundRegions };
      const outputs: { file: string; data: unknown }[] = [];
      if (result.ok) {
        if (o.out) outputs.push({ file: o.out, data: result.scene });
        if (o.sprite) outputs.push({ file: o.sprite, data: result.sprite });
        if (o.mappingOut) outputs.push({ file: o.mappingOut, data: mapping });
        if (o.resourcesOut) outputs.push({ file: o.resourcesOut, data: result.resources });
        if (new Set(outputs.map(v => resolve(v.file).toLowerCase())).size !== outputs.length) throw new Error("Room output paths must differ");
        const sources = await Promise.all(context.inputs.map(async file => ({ path: (await realpath(file)).toLowerCase(), stat: await lstat(file) }))), seen: Stats[] = [];
        for (const { file } of outputs) {
          const target = resolve(file);
          await assertNoSymlinkPath(target);
          if (sources.some(s => s.path === target.toLowerCase())) throw new Error("Output cannot overwrite a room/asset source");
          try {
            const info = await lstat(target);
            if (sources.some(s => info.ino !== 0 && info.ino === s.stat.ino && info.dev === s.stat.dev)) throw new Error("Output aliases a room/asset source");
            if (seen.some(s => info.ino !== 0 && info.ino === s.ino && info.dev === s.dev)) throw new Error("Room outputs alias each other");
            seen.push(info); if (!o.force) throw new Error("Output exists; use --force only for selected outputs");
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        }
        for (const { file, data } of outputs) {
          const text = JSON.stringify(data, null, 2) + "\n";
          await mkdir(dirname(resolve(file)), { recursive: true });
          if (o.force) await atomicWrite(file, text); else await writeFile(file, text, { flag: "wx" });
        }
      }
      if (o.json) process.stdout.write(JSON.stringify({ ...result, sourceFiles: context.sourceFiles, outputs: outputs.map(v => resolve(v.file)) }) + "\n");
      else process.stdout.write(`${result.ok ? "OK" : "FAILED"}: semantic room\n` + result.diagnostics.map(d => `${d.severity} ${d.code} ${d.path}: ${d.message} ${d.suggestion}\n`).join("") + outputs.map(v => `Output: ${resolve(v.file)}\n`).join(""));
      if (!result.ok) process.exitCode = 1;
    });
}
