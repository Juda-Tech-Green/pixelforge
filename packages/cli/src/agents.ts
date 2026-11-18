import { Command, InvalidArgumentError } from "commander";
import { readFile, writeFile, mkdir, lstat, realpath } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { z } from "zod";
import { projectSchema, fromDocument, listOperations, getAnimation } from "@pixelforge/core";
import { soundSchema } from "@pixelforge/audio-core";
import { rigSchema, poseSchema, posesSchema, animationSchema, sceneSchema, parseRig,
  applyPose, sampleRigAnimation, validateScene, type Diagnostic, type SpriteResources } from "@pixelforge/geometry";
import { exportPreview, exportContactSheet, PREVIEW_LIMITS, assertNoSymlinkPath } from "@pixelforge/exporters";

const schemas = { sprite: projectSchema, sound: soundSchema, rig: rigSchema,
  pose: poseSchema, poses: posesSchema, rigAnimation: animationSchema, scene: sceneSchema };
type AssetType = keyof typeof schemas;
const report = (data: unknown) => process.stdout.write(JSON.stringify(data) + "\n");
const integer = (value: string) => {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new InvalidArgumentError("Expected nonnegative integer");
  return Number(value);
};
async function json(file: string): Promise<unknown> {
  if ((await lstat(file)).size > 67_108_864) throw new Error("Input exceeds 64MiB");
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}
function detect(input: unknown, file: string): AssetType | undefined {
  const suffix = basename(file).split(".").at(-2);
  if (suffix && Object.hasOwn(schemas, suffix)) return suffix as AssetType;
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  if ("joints" in input) return "rig";
  if ("objects" in input) return "scene";
  if ("poses" in input || "rig" in input) return "poses";
  if ("rotations" in input || "targets" in input) return "pose";
  if ("keys" in input || "contacts" in input) return "rigAnimation";
  if ("voices" in input || "sampleRate" in input) return "sound";
  if ("palette" in input || "layers" in input || "frames" in input) return "sprite";
}
const pathOf = (parts: PropertyKey[]) => "$" + parts.map(p => typeof p === "number" ? `[${p}]` : `[${JSON.stringify(String(p))}]`).join("");
function commands(command: Command): unknown[] {
  return command.commands.map(c => ({ name: c.name(), description: c.description(),
    inputs: c.registeredArguments.map(a => ({ name: a.name(), required: a.required, variadic: a.variadic })),
    flags: c.options.map(o => ({ flags: o.flags, description: o.description, required: o.mandatory, default: o.defaultValue })),
    commands: commands(c) }));
}
export function registerAgentCommands(program: Command): void {
  program.command("capabilities").description("Discover installed runtime commands, schemas and limits")
    .option("--json", "Machine-readable metadata")
    .option("--schema <type>", "Return the authoritative JSON schema for an asset type")
    .action((o: { json?: boolean; schema?: string }) => {
      if (o.schema) {
        if (!Object.hasOwn(schemas, o.schema)) throw new Error(`Unknown asset type; choose ${Object.keys(schemas).join(", ")}`);
        report(z.toJSONSchema(schemas[o.schema as AssetType])); return;
      }
      const data = { runtimeVersion: program.version(), assetTypes: Object.keys(schemas).map(type => ({ type,
        formatVersion: type === "pose" || type === "rigAnimation" ? null : "1.0",
        schema: `capabilities --schema ${type}`, doctor: true })),
        commands: commands(program), operations: listOperations(),
        rendering: { preview: ["sprite", "rig-generated sprite"], outputs: ["png", "contact JSON"],
          previewLimits: PREVIEW_LIMITS, contactLimits: { maxCells: 1000, maxPixels: 67_108_864, maxDimension: 32767, maxColumns: 32, maxScale: 16 },
          productionExports: ["spritesheet", "frames", "phaser"],
          unavailable: ["direct rig/scene preview; generate an ordinary sprite first", "automatic repair"] },
        inputLimitBytes: 67_108_864 };
      if (o.json) report(data);
      else process.stdout.write(`PixelForge ${data.runtimeVersion}\nAssets: ${Object.keys(schemas).join(", ")}\nCommands: ${program.commands.map(c => c.name()).join(", ")}\nUse capabilities --json for flags/limits; --schema TYPE for required fields.\nPreview: PNG and labeled contact JSON; export: spritesheet, frames, phaser.\n`);
    });
  program.command("doctor").description("Read-only strict asset preflight; errors exit 1, warnings exit 0")
    .argument("<file>").option("--json").option("--type <type>", "Explicit asset type")
    .option("--rig <file>", "Rig context for pose/library/animation references")
    .option("--asset <id=file>", "Scene sprite resource", (v: string, prev: string[]) => [...prev, v], [])
    .action(async (file: string, o: { json?: boolean; type?: string; rig?: string; asset: string[] }) => {
      let assetType: string = o.type ?? "unknown";
      const diagnostics: Record<string, unknown>[] = [];
      const add = (code: string, path: string, message: string, suggestion: string, extra: Record<string, unknown> = {}) =>
        diagnostics.push({ code, severity: "error", assetType, file: resolve(file), path, message, suggestion, automaticRepair: false, ...extra });
      const geometry = (items: Diagnostic[], path = "$") => items.forEach(d => add(`PF_${d.constraint.replace(/-/g, "_").toUpperCase()}`, path, d.constraint, d.action, { severity: d.severity, expected: d.expected, actual: d.actual }));
      try {
        const input = await json(file);
        assetType = o.type ?? detect(input, file) ?? "unknown";
        if (!Object.hasOwn(schemas, assetType)) add("PF_ASSET_UNSUPPORTED", "$", "Cannot identify a supported asset type.", `Use --type ${Object.keys(schemas).join("|")} for incomplete assets.`);
        else {
          const type = assetType as AssetType, result = schemas[type].safeParse(input);
          if (!result.success) for (const issue of result.error.issues) {
            const contact = issue.path.includes("contacts") && issue.path.at(-1) === "id";
            const id = issue.code === "invalid_format";
            add(contact ? "PF_CONTACT_ID_INVALID" : id ? "PF_IDENTIFIER_INVALID" : `PF_SCHEMA_${issue.code.toUpperCase()}`,
              pathOf(issue.path), issue.message,
              id ? "Use a letter followed by up to 63 letters, digits, underscores or hyphens, e.g. left_foot." : `Correct this field using capabilities --schema ${type}.`,
              { ...("expected" in issue ? { expected: issue.expected } : {}) });
          } else {
            const rig = o.rig ? parseRig(await json(o.rig)) : undefined;
            if (type === "pose") {
              const pose = poseSchema.parse(input);
              if (rig) geometry(applyPose(rig, pose).diagnostics);
              else add("PF_CONTEXT_REQUIRED", "$", "Joint and IK references were not checked without a rig.", "Pass --rig FILE to check references.", { severity: "info" });
            }
            if (type === "poses") {
              const library = posesSchema.parse(input);
              if (rig) {
                if (library.rig !== rig.id) add("PF_RIG_REFERENCE", '$["rig"]', "Pose library rig does not match the supplied rig ID.", `Use rig ID ${rig.id}, rather than its filename.`, { expected: rig.id, actual: library.rig });
                else {
                  library.poses.forEach((p, i) => geometry(applyPose(rig, p).diagnostics, `$["poses"][${i}]`));
                  library.animations.forEach(a => sampleRigAnimation(rig, library, a.id).forEach(f => geometry(f.diagnostics)));
                }
              } else add("PF_CONTEXT_REQUIRED", '$["rig"]', "Rig references were not checked.", "Pass --rig FILE; the library rig field must contain its ID, not its filename.", { severity: "info" });
            }
            if (type === "rigAnimation") add("PF_CONTEXT_REQUIRED", "$", "Standalone animation schema checked; pose-library references require a poses asset.", "Place the animation in a poses library and run doctor with --rig FILE.", { severity: "info" });
            if (type === "scene") {
              const sprites: SpriteResources = Object.create(null) as SpriteResources;
              if (o.asset.length > 32) throw new Error("At most 32 sprite resources allowed");
              for (const item of o.asset) {
                const at = item.indexOf("="); if (at < 1) throw new Error("Use --asset ID=FILE");
                const id = item.slice(0, at); if (Object.hasOwn(sprites, id)) throw new Error(`Duplicate resource ${id}`);
                sprites[id] = fromDocument(await json(item.slice(at + 1)));
              }
              geometry(validateScene(input, sprites));
            }
          }
        }
      } catch (error) {
        add(error instanceof SyntaxError ? "PF_JSON_INVALID" : "PF_PREFLIGHT_FAILED", "$", error instanceof Error ? error.message : String(error), "Correct the reported input or reference; use the matching schema and rig context.");
      }
      diagnostics.sort((a, b) => String(a.path).localeCompare(String(b.path), "en") || String(a.code).localeCompare(String(b.code), "en") || String(a.message).localeCompare(String(b.message), "en"));
      const ok = !diagnostics.some(d => d.severity === "error");
      if (o.json) report({ ok, assetType, file: resolve(file), diagnostics });
      else process.stdout.write(`${ok ? "OK" : "FAILED"} ${assetType}: ${file}\n` + diagnostics.map(d => `${d.severity} ${d.code} ${d.path}: ${d.message} ${d.suggestion}\n`).join(""));
      if (!ok) process.exitCode = 1;
    });
  program.command("preview").description("Fast read-only sprite PNG or labeled animation contact sheet")
    .argument("<file>").requiredOption("--out <png>", "Output PNG (existing outputs require --force)")
    .option("--json", "Machine-readable summary").option("--force", "Replace selected output files")
    .option("--animation <name>").option("--frame <index>", "Zero-based frame index", integer, 0)
    .option("--contact-sheet").option("--scale <integer>", "Nearest-neighbor scale 1..16", integer, 4)
    .option("--background <mode>", "transparent or checkerboard", "transparent").option("--grid", "Single-frame pixel grid")
    .option("--columns <count>", "Contact columns 1..32", integer, 4)
    .option("--start <index>", "First contact entry", integer, 0).option("--end <index>", "Exclusive last contact entry", integer)
    .action(async (file: string, o: { out: string; json?: boolean; force?: boolean; animation?: string; frame: number; contactSheet?: boolean; scale: number; background: string; grid?: boolean; columns: number; start: number; end?: number }) => {
      if (!o.out.endsWith(".png")) throw new Error("Preview output must end in .png");
      if (o.contactSheet && o.grid) throw new Error("Grid is supported only for single-frame previews");
      const outputs = [o.out, ...(o.contactSheet ? [o.out.replace(/\.png$/, ".contact.json")] : [])];
      const source = await realpath(file);
      for (const target of outputs) {
        if (resolve(target).toLowerCase() === resolve(file).toLowerCase()) throw new Error("Output cannot overwrite source");
        await assertNoSymlinkPath(resolve(target));
        try {
          const info = await lstat(target);
          if ((await realpath(target)).toLowerCase() === source.toLowerCase() || (info.ino !== 0 && info.ino === (await lstat(source)).ino && info.dev === (await lstat(source)).dev)) throw new Error("Output aliases source");
          if (!o.force) throw new Error("Output exists; use --force to replace selected outputs");
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      const p = fromDocument(await json(file));
      const result = o.contactSheet ? await exportContactSheet(p, { ...o, animations: o.animation ? [o.animation] : undefined, background: o.background as "transparent" | "checkerboard" }) :
        await exportPreview(p, (o.animation ? getAnimation(p, o.animation).frames[o.frame]?.frameId : p.frames[o.frame]?.id) ?? "", o);
      for (const target of outputs) await mkdir(dirname(resolve(target)), { recursive: true });
      await writeFile(o.out, result.png, { flag: o.force ? "w" : "wx" });
      if ("map" in result) await writeFile(outputs[1]!, JSON.stringify(result.map, null, 2) + "\n", { flag: o.force ? "w" : "wx" });
      const summary = { source: resolve(file), preview: resolve(o.out), width: p.width, height: p.height, scale: o.scale,
        outputWidth: "map" in result ? result.map.width : result.width, outputHeight: "map" in result ? result.map.height : result.height,
        warnings: "warnings" in result ? result.warnings : [], ...(o.contactSheet ? { metadata: resolve(outputs[1]!) } : {}) };
      if (o.json) report(summary); else process.stdout.write(`Preview: ${summary.preview}\n${summary.metadata ? `Metadata: ${summary.metadata}\n` : ""}${summary.warnings.map(w => w.message).join("\n")}\n`);
    });
}
