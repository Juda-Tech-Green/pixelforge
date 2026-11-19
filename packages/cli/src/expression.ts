import type { Command } from "commander";
import { readFile, lstat, realpath, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { resolveSemanticExpression, type FaceMatrix } from "@pixelforge/core";
import { applyPose, parseRig, poseSchema } from "@pixelforge/geometry";
import { assertNoSymlinkPath } from "@pixelforge/exporters";

type Options = { sprite?: string; landmarks?: string; rig?: string; pose?: string; joint?: string };
async function read(file: string) {
  const info = await lstat(file);
  if (!info.isFile() || info.size > 67_108_864) throw new Error("Expression inputs must be regular files up to 64MiB");
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}
export async function expressionContext(input: unknown, o: Options) {
  if (!o.sprite || !o.landmarks) throw new Error("Expression resolution requires --sprite FILE and --landmarks FILE");
  const sprite = await read(o.sprite), landmarks = await read(o.landmarks);
  let matrix: FaceMatrix | undefined;
  if (o.rig || o.pose || o.joint) {
    if (!o.rig || !o.pose) throw new Error("FK context requires both --rig FILE and --pose FILE");
    const rig = parseRig(await read(o.rig)), pose = poseSchema.parse(await read(o.pose));
    const solved = applyPose(rig, pose);
    // This path uses an already resolved pose, so silently re-solving/clamping targets is forbidden.
    if (pose.targets.length || solved.diagnostics.length) throw new Error("Use a resolved pose with no IK targets or constraint diagnostics");
    const joint = solved.joints[o.joint ?? "head"];
    if (!joint) throw new Error("Declared head joint is missing; use --joint ID");
    const source = sprite as { width?: number; height?: number; palette?: unknown; metadata?: { pixelforgeGeometry?: { rig?: string; pose?: string } } };
    if (source.width !== rig.canvas.width || source.height !== rig.canvas.height || JSON.stringify(source.palette) !== JSON.stringify(rig.palette) ||
      source.metadata?.pixelforgeGeometry?.rig !== rig.id || source.metadata?.pixelforgeGeometry?.pose !== pose.id)
      throw new Error("Sprite must retain matching rig/pose provenance, canvas and palette; render this pose first");
    matrix = joint.matrix;
  }
  return resolveSemanticExpression(sprite, input, landmarks, matrix);
}
export function registerExpressionCommands(program: Command, atomicWrite: (file: string, data: string | Uint8Array) => Promise<void>) {
  program.command("sprite").description("Explicit sprite authoring helpers")
    .command("expression").description("Opt-in semantic facial expressions (v0.8.3)")
    .command("resolve").argument("<request>")
    .requiredOption("--sprite <file>", "Immutable neutral sprite source")
    .requiredOption("--landmarks <file>", "Explicit local feature landmarks and safe regions")
    .option("--rig <file>", "Optional rig for head-local FK context")
    .option("--pose <file>", "Matching already resolved pose")
    .option("--joint <id>", "Head joint role mapping (default head)")
    .option("--out <file>", "Editable sprite variant; omitted means no sprite file is written")
    .option("--operations-out <file>", "Write existing operations 1.0 batch for apply")
    .option("--force", "Replace selected outputs, protecting all inputs")
    .option("--json", "Operations, variant, provenance and actionable diagnostics")
    .action(async (request: string, o: Options & { out?: string; operationsOut?: string; force?: boolean; json?: boolean }) => {
      const inputs = [request, o.sprite!, o.landmarks!, ...[o.rig, o.pose].filter((v): v is string => Boolean(v))];
      const outputs = [o.out, o.operationsOut].filter((v): v is string => Boolean(v));
      const result = await expressionContext(await read(request), o);
      if (result.ok) {
        const sources = await Promise.all(inputs.map(async file => ({ path: (await realpath(file)).toLowerCase(), stat: await lstat(file) })));
        if (new Set(outputs.map(f => resolve(f).toLowerCase())).size !== outputs.length) throw new Error("Outputs must differ");
        const outputStats = [];
        for (const file of outputs) {
          const target = resolve(file);
          if (sources.some(s => s.path === target.toLowerCase())) throw new Error("Output cannot overwrite an input source");
          await assertNoSymlinkPath(target);
          try {
            const info = await lstat(target);
            if (sources.some(s => info.ino !== 0 && info.ino === s.stat.ino && info.dev === s.stat.dev)) throw new Error("Output aliases an input source");
            if (!o.force) throw new Error("Output exists; use --force to replace selected outputs");
            outputStats.push(info);
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        }
        if (outputStats.length === 2 && outputStats[0]!.ino !== 0 && outputStats[0]!.ino === outputStats[1]!.ino && outputStats[0]!.dev === outputStats[1]!.dev)
          throw new Error("Outputs alias each other");
        for (const file of outputs) {
          const data = JSON.stringify(file === o.out && "sprite" in result ? result.sprite : result.operations, null, 2) + "\n";
          await mkdir(dirname(resolve(file)), { recursive: true });
          if (o.force) await atomicWrite(file, data); else await writeFile(file, data, { flag: "wx" });
        }
      }
      const sourceFiles = await Promise.all(inputs.map(async file => ({ file: resolve(file), sha256: createHash("sha256").update(await readFile(file)).digest("hex") })));
      if (o.json) process.stdout.write(JSON.stringify({ ...result, sourceFiles, outputs: result.ok ? outputs.map(f => resolve(f)) : [] }) + "\n");
      else process.stdout.write(`${result.ok ? "OK" : "FAILED"}: semantic expression; ${result.operations.operations.length} editable operations\n` + result.diagnostics.map(d => `${d.severity} ${d.code} ${d.path}: ${d.message} ${d.suggestion}\n`).join("") + (result.ok ? outputs.map(f => `Output: ${resolve(f)}\n`).join("") : ""));
      if (!result.ok) process.exitCode = 1;
    });
}
