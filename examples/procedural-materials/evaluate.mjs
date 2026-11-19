// Bounded CPU example through existing CLI commands; all outputs go to a NEW directory.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, "../..");
if (process.argv.length !== 4 || process.argv[2] !== "--out") throw new Error("Usage: node examples/procedural-materials/evaluate.mjs --out NEW_DIRECTORY");
const out = resolve(process.argv[3]); mkdirSync(out);
const run = (...args) => {
  const p = spawnSync(process.execPath, ["--import", "tsx", "--conditions=development", "packages/cli/src/index.ts", ...args], { cwd: root, encoding: "utf8" });
  if (p.status !== 0) throw new Error(p.stderr || p.stdout);
  return JSON.parse(p.stdout);
};
const desk = join(out, "desk.base.sprite.json"), cabinet = join(out, "cabinet.base.sprite.json"), wall = join(out, "wall.base.sprite.json");
const deskMask = join(out, "desk.mask.json"), cabinetMask = join(out, "cabinet.mask.json"), wallMask = join(out, "wall.mask.json");
run("prop", "resolve", join(here, "desk.prop.json"), "--out", desk, "--json");
run("prop", "resolve", join(here, "cabinet.prop.json"), "--out", cabinet, "--json");
run("init", "Wall material fixture", "--width", "32", "--height", "24", "--palette", join(here, "wall.palette.json"), "--output", join(out, "wall.blank.sprite.json"));
run("apply", join(out, "wall.blank.sprite.json"), "--operations", join(here, "wall.ops.json"), "--output", wall);
run("material", "mask", desk, "--parts", "desk-top-surface,desk-right-drawer-0,desk-right-drawer-1", "--out", deskMask, "--json");
run("material", "mask", cabinet, "--parts", "cabinet-drawer-0,cabinet-drawer-1,cabinet-drawer-2,cabinet-drawer-3", "--out", cabinetMask, "--json");
run("material", "mask", wall, "--regions", join(here, "wall.regions.json"), "--out", wallMask, "--json");
const results = [];
for (const [id, sprite, mask] of [["walnut", desk, deskMask], ["honey-oak", desk, deskMask], ["brushed-olive", cabinet, cabinetMask], ["warm-plaster", wall, wallMask], ["aged-brick", wall, wallMask]]) {
  const request = join(here, `${id}.material.json`), output = join(out, `${id}.sprite.json`), ops = join(out, `${id}.ops.json`);
  const preflight = run("doctor", request, "--sprite", sprite, "--mask", mask, "--json");
  const applied = run("material", "apply", request, "--sprite", sprite, "--mask", mask, "--out", output, "--operations-out", ops, "--json");
  const doctor = run("doctor", output, "--json");
  const native = run("preview", output, "--scale", "1", "--out", join(out, `${id}.native.png`), "--json");
  const preview = run("preview", output, "--scale", "4", "--out", join(out, `${id}.preview.png`), "--json");
  results.push({ id, sprite, mask, request, preflight, applied, doctor, native, preview });
}
writeFileSync(join(out, "evaluation.json"), JSON.stringify({ results }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ ok: true, out, report: join(out, "evaluation.json"), previews: results.map(r => r.preview.preview) }));
