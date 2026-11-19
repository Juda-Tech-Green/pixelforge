// Deterministic authoring/preview demonstration; no pixel loops or custom rasterizer.
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, "../..");
if (process.argv.length !== 4 || process.argv[2] !== "--out") throw new Error("Usage: node examples/parametric-props/evaluate.mjs --out NEW_DIRECTORY");
const out = resolve(process.argv[3]);
mkdirSync(out); // Existing evaluation assets are never replaced.
const run = (...args) => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--conditions=development", "packages/cli/src/index.ts", ...args], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};
const results = [];
for (const id of ["clerk-desk", "executive-desk", "filing-cabinet", "office-window"]) {
  const source = join(here, `${id}.prop.json`), sprite = join(out, `${id}.sprite.json`), rig = join(out, `${id}.rig.json`);
  const resolution = run("prop", "resolve", source, "--out", sprite, "--out-rig", rig, "--json");
  const doctor = run("doctor", source, "--json"), spriteDoctor = run("doctor", sprite, "--json"), rigDoctor = run("doctor", rig, "--json");
  const native = run("preview", sprite, "--scale", "1", "--out", join(out, `${id}.native.png`), "--json");
  const preview = run("preview", sprite, "--scale", "4", "--out", join(out, `${id}.preview.png`), "--json");
  results.push({ id, source, resolution, doctor, spriteDoctor, rigDoctor, native, preview });
}
const report = join(out, "evaluation.json");
writeFileSync(report, JSON.stringify({ results }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ ok: true, out, report, previews: results.map(r => r.preview.preview) }));
