// Prepare one immutable asset set, then compose both layouts. No geometry/material rebuild for placement changes.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, "../..");
if (process.argv.length !== 4 || process.argv[2] !== "--out") throw new Error("Usage: node examples/semantic-room/evaluate.mjs --out NEW_DIRECTORY");
const out = resolve(process.argv[3]); mkdirSync(out); mkdirSync(join(out, "assets"));
const save = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
const commands = []; let stage = "prepare-assets";
const run = (...args) => {
  commands.push({ stage, args });
  const r = spawnSync(process.execPath, ["--import", "tsx", "--conditions=development", "packages/cli/src/index.ts", ...args], { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return JSON.parse(r.stdout);
};
const asset = name => join(out, "assets", name);
const mat = resolve(here, "../procedural-materials"), props = resolve(here, "../parametric-props");
run("prop", "resolve", join(mat, "desk.prop.json"), "--out", asset("desk.base.sprite.json"), "--json");
run("material", "mask", asset("desk.base.sprite.json"), "--parts", "desk-top-surface,desk-right-drawer-0,desk-right-drawer-1", "--out", asset("desk.mask.json"), "--json");
run("material", "apply", join(mat, "walnut.material.json"), "--sprite", asset("desk.base.sprite.json"), "--mask", asset("desk.mask.json"), "--out", asset("desk.sprite.json"), "--json");
run("prop", "resolve", join(mat, "cabinet.prop.json"), "--out", asset("cabinet.base.sprite.json"), "--json");
run("material", "mask", asset("cabinet.base.sprite.json"), "--parts", "cabinet-drawer-0,cabinet-drawer-1,cabinet-drawer-2,cabinet-drawer-3", "--out", asset("cabinet.mask.json"), "--json");
run("material", "apply", join(mat, "brushed-olive.material.json"), "--sprite", asset("cabinet.base.sprite.json"), "--mask", asset("cabinet.mask.json"), "--out", asset("cabinet.sprite.json"), "--json");
run("prop", "resolve", join(props, "office-window.prop.json"), "--out", asset("window.sprite.json"), "--json");
run("init", "Prepared plaster wall", "--width", "192", "--height", "74", "--palette", join(mat, "wall.palette.json"), "--output", asset("wall.blank.sprite.json"));
run("apply", asset("wall.blank.sprite.json"), "--operations", join(here, "wall.ops.json"), "--output", asset("wall.base.sprite.json"));
run("material", "mask", asset("wall.base.sprite.json"), "--regions", join(here, "wall.regions.json"), "--out", asset("wall.mask.json"), "--json");
run("material", "apply", join(here, "wall.material.json"), "--sprite", asset("wall.base.sprite.json"), "--mask", asset("wall.mask.json"), "--out", asset("wall.sprite.json"), "--json");
const assetIds = ["cabinet", "desk", "wall", "window"];
const hashes = () => Object.fromEntries(assetIds.map(id => [id, createHash("sha256").update(readFileSync(asset(`${id}.sprite.json`))).digest("hex")]));
const before = hashes(), results = [];
stage = "compose-layouts";
for (const layout of ["layout-a", "layout-b"]) {
  const request = join(out, `${layout}.room.json`); save(request, JSON.parse(readFileSync(join(here, `${layout}.room.json`), "utf8")));
  const scene = join(out, `${layout}.scene.json`), sprite = join(out, `${layout}.sprite.json`), mapping = join(out, `${layout}.mapping.json`);
  const resolution = run("room", "resolve", request, "--out", scene, "--sprite", sprite, "--mapping-out", mapping, "--resources-out", join(out, `${layout}.resources.json`), "--json");
  const doctor = run("doctor", request, "--json"), spriteDoctor = run("doctor", sprite, "--json");
  const sceneArgs = assetIds.flatMap(id => ["--asset", `${id}=${asset(`${id}.sprite.json`)}`]);
  const sceneDoctor = run("doctor", scene, ...sceneArgs, "--json");
  const preview = run("preview", sprite, "--scale", "2", "--out", join(out, `${layout}.png`), "--json");
  results.push({ layout, request, scene, sprite, mapping, resolution, doctor, spriteDoctor, sceneDoctor, preview });
}
const after = hashes(); if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Composition changed an immutable asset");
save(join(out, "evaluation.json"), { preparedOnce: true, before, after, commands, results });
console.log(JSON.stringify({ ok: true, out, report: join(out, "evaluation.json"), previews: results.map(r => r.preview.preview) }));
