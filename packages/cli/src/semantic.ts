import type { Command } from "commander";
import { readFile, lstat, mkdir, writeFile, realpath } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { assertNoSymlinkPath } from "@pixelforge/exporters";
import { resolveSemanticPose } from "@pixelforge/geometry";

export async function readSemanticInput(file: string): Promise<unknown> {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 2_097_152) throw new Error("Semantic inputs must be regular files up to 2MiB");
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}
export async function semanticContext(options: { library?: string; object?: string[] }) {
  if ((options.object?.length ?? 0) > 8) throw new Error("At most eight object files may be supplied");
  return { library: options.library ? await readSemanticInput(options.library) : undefined,
    objects: await Promise.all((options.object ?? []).map(readSemanticInput)) };
}
export function registerSemanticCommand(rig: Command, atomicWrite: (file: string, data: string | Uint8Array) => Promise<void>) {
  rig.command("resolve-pose").description("Resolve semantic posture, hand IK, gaze and one explicit held prop (v0.8.2)")
    .argument("<request>").requiredOption("--rig <file>", "Existing source rig")
    .option("--library <file>", "Existing pose library for basePose and named contacts")
    .option("--object <file>", "Held-object definition, repeat for target resources", (v: string, previous: string[]) => [...previous, v], [])
    .option("--out <file>", "Write an existing-schema-compatible resolved pose; omitted means read-only")
    .option("--out-rig <file>", "Also write the derived attachment rig; requires --out")
    .option("--force", "Replace explicitly selected outputs, protecting all input sources")
    .option("--json", "JSON pose/rig, reach, optional gaze/placement metadata and diagnostics")
    .action(async (request: string, o: { rig: string; library?: string; object: string[]; out?: string; outRig?: string; force?: boolean; json?: boolean }) => {
      if (o.outRig && !o.out) throw new Error("--out-rig requires --out; omit both for read-only resolution");
      const result = resolveSemanticPose(await readSemanticInput(o.rig), await readSemanticInput(request), await semanticContext(o));
      const outputs = [o.out, o.outRig].filter((v): v is string => Boolean(v));
      if (result.ok && o.out) {
        if (result.attachment && !o.outRig) throw new Error("Held-object rendering requires --out-rig alongside --out; otherwise omit both for a read-only result");
        const inputs = await Promise.all([request, o.rig, ...(o.library ? [o.library] : []), ...o.object].map(file => realpath(file)));
        if (new Set(outputs.map(p => resolve(p).toLowerCase())).size !== outputs.length) throw new Error("Pose and derived rig outputs must differ");
        for (const file of outputs) {
          const target = resolve(file);
          if (inputs.some(p => p.toLowerCase() === target.toLowerCase())) throw new Error("Output cannot overwrite an input source");
          await assertNoSymlinkPath(target);
          try {
            const info = await lstat(target);
            for (const source of inputs) {
              const original = await lstat(source);
              if (info.ino !== 0 && info.ino === original.ino && info.dev === original.dev) throw new Error("Output aliases an input source");
            }
            if (!o.force) throw new Error("Output exists; use --force to replace an explicitly selected output");
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        }
        for (const [index, file] of outputs.entries()) {
          const data = JSON.stringify(index === 0 ? result.pose : result.rig, null, 2) + "\n";
          await mkdir(dirname(resolve(file)), { recursive: true });
          if (o.force) await atomicWrite(file, data);
          else await writeFile(file, data, { flag: "wx" });
        }
      }
      if (o.json) process.stdout.write(JSON.stringify({ ...result, outputs: result.ok ? outputs.map(p => resolve(p)) : [] }) + "\n");
      else process.stdout.write(`${result.ok ? "OK" : "FAILED"}: semantic pose\n` + result.hands.map(h => `${h.hand}: ${h.reachable ? "reached" : "unreachable"}, residual ${h.residual} px\n`).join("") +
        (result.gaze ? `Gaze: ${result.gaze.joint}, angle ${result.gaze.appliedAngle} rad, direction error ${result.gaze.directionError} rad\n` : "") +
        result.diagnostics.map(d => `${d.severity} ${d.code} ${d.path}: ${d.message} ${d.suggestion}\n`).join("") +
        (outputs.length && result.ok ? outputs.map(p => `Output: ${resolve(p)}\n`).join("") : "Read-only resolution; use --json to inspect the pose and derived rig.\n"));
      if (!result.ok) process.exitCode = 1;
    });
}
