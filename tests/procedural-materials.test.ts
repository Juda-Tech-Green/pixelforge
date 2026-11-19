import { test, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, linkSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { z } from "zod";
import ts from "typescript";
import { resolveProp, propSurfaceMask, buildProp, resolveSemanticPose } from "@pixelforge/geometry";
import { applyMaterial, materialSchema, surfaceMaskSchema, surfaceRegionsSchema, surfaceMaskFromRegions, validateSurfaceMask,
  createProject, applyOperations, fromDocument, toDocument, projectSchema, operationsSchema, renderFrame, resolveSemanticExpression,
  type ProjectDocument, type SurfaceMask } from "@pixelforge/core";
const dir = resolve("examples/procedural-materials"), read = (f: string) => JSON.parse(readFileSync(f, "utf8"));
const ids = ["walnut", "honey-oak", "brushed-olive", "warm-plaster", "aged-brick"], materials = ids.map(id => read(join(dir, `${id}.material.json`)));
const deskProp = read(join(dir, "desk.prop.json")), cabinetProp = read(join(dir, "cabinet.prop.json"));
const desk = resolveProp(deskProp).sprite!, cabinet = resolveProp(cabinetProp).sprite!;
const wall = toDocument(applyOperations(createProject({ name: "Wall", width: 32, height: 24, palette: read(join(dir, "wall.palette.json")) }), read(join(dir, "wall.ops.json"))));
function maskFor(sprite: ProjectDocument, parts: string[]): SurfaceMask {
  const result = propSurfaceMask(sprite, parts);
  if (!result.ok || !("mask" in result) || !result.mask) throw new Error(JSON.stringify(result.diagnostics));
  return result.mask;
}
const deskMask = maskFor(desk, ["desk-top-surface", "desk-right-drawer-0", "desk-right-drawer-1"]);
const cabinetMask = maskFor(cabinet, ["cabinet-drawer-0", "cabinet-drawer-1", "cabinet-drawer-2", "cabinet-drawer-3"]);
const regionResult = surfaceMaskFromRegions(wall, read(join(dir, "wall.regions.json")));
if (!regionResult.ok || !("mask" in regionResult) || !regionResult.mask) throw new Error("Invalid wall mask");
const wallMask = regionResult.mask;
const snapshot = JSON.stringify({ deskProp, cabinetProp, desk, cabinet, wall, deskMask, cabinetMask, wallMask, materials });
const digest = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
function cli(...args: string[]) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--conditions=development", "packages/cli/src/index.ts", ...args], { encoding: "utf8" });
  return { ...result, data: result.stdout.trim() ? JSON.parse(result.stdout) : undefined };
}
const bindings: [unknown, ProjectDocument, SurfaceMask][] = [[materials[0], desk, deskMask], [materials[1], desk, deskMask], [materials[2], cabinet, cabinetMask], [materials[3], wall, wallMask], [materials[4], wall, wallMask]];

test("schemas/types are authoritative and equal seeded inputs give byte-identical editable output", () => {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile), parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const roots = ["packages/core/src/materials/schema.ts", "packages/core/src/materials/masks.ts", "packages/core/src/materials/apply.ts", "packages/core/src/index.ts", "packages/geometry/src/prop-surfaces.ts", "packages/geometry/src/index.ts", "packages/cli/src/materials.ts", "packages/cli/src/agents.ts", "packages/cli/src/index.ts", "scripts/schemas.ts", "tests/procedural-materials.test.ts", "tests/parametric-props.test.ts"].map(f => resolve(f).replaceAll("\\", "/"));
  const program = ts.createProgram(roots, { ...parsed.options, noEmit: true });
  const errors = ts.getPreEmitDiagnostics(program).filter(d => d.file && roots.some(f => f.toLowerCase() === d.file!.fileName.replaceAll("\\", "/").toLowerCase()));
  expect(errors.map(d => `${d.file!.fileName}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`)).toEqual([]);
  for (const [name, schema] of Object.entries({ material: materialSchema, surfaceMask: surfaceMaskSchema, surfaceRegions: surfaceRegionsSchema })) expect(read(`schemas/${name}.schema.json`)).toEqual(z.toJSONSchema(schema));
  for (const [material, sprite, mask] of bindings) {
    const a = applyMaterial(sprite, material, mask), b = applyMaterial(sprite, material, mask);
    expect(a.ok, JSON.stringify(a.diagnostics)).toBe(true); expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.operations.operations.length).toBeGreaterThan(0);
    const reversed = structuredClone(mask); reversed.surfaces.reverse(); reversed.surfaces.forEach(s => s.runs.reverse());
    expect(JSON.stringify(applyMaterial(sprite, material, reversed))).toBe(JSON.stringify(a));
  }
  const dither = { format: "pixelforge-material", version: "1.0", id: "ordered", type: "dither", seed: 1953, palette: { base: 2, highlight: 3, shadow: 4 } };
  expect(applyMaterial(wall, dither, wallMask).ok).toBe(true);
});

test("different seeds vary repeatably; direction transposes grain and brick joints repeat predictably", () => {
  const a = applyMaterial(desk, materials[0], deskMask), changed = { ...materials[0], seed: 1954 };
  const b = applyMaterial(desk, changed, deskMask);
  expect(a.ok && b.ok).toBe(true); expect("sprite" in a && a.sprite!.frames).not.toEqual("sprite" in b && b.sprite!.frames);
  expect(b).toEqual(applyMaterial(desk, changed, deskMask));
  const square = toDocument(applyOperations(createProject({ name: "Grain", width: 32, height: 32, palette: wall.palette }), { version: "1.0", operations: [{ op: "drawRect", frame: "frame-0", layer: "base", x: 1, y: 1, width: 30, height: 30, color: 2, filled: true }] }));
  const squareMask = surfaceMaskFromRegions(square, { format: "pixelforge-surface-regions", version: "1.0", id: "square", surfaces: [{ id: "face", frame: "frame-0", layer: "base", regions: [{ x: 1, y: 1, width: 30, height: 30 }] }] });
  if (!("mask" in squareMask)) throw new Error("Missing square mask");
  const common = { ...materials[0], palette: { base: 2, highlight: 3, shadow: 4 } };
  const horizontal = applyMaterial(square, common, squareMask.mask), vertical = applyMaterial(square, { ...common, parameters: { ...common.parameters, direction: "vertical" } }, squareMask.mask);
  if (!("sprite" in horizontal) || !("sprite" in vertical)) throw new Error("Missing grain result");
  for (let y = 1; y < 31; y++) for (let x = 1; x < 31; x++) expect(horizontal.sprite!.frames[0]!.layers.base![y * 32 + x]).toBe(vertical.sprite!.frames[0]!.layers.base![x * 32 + y]);
  const brick = applyMaterial(wall, { ...materials[4], parameters: { ...materials[4].parameters, variation: 0 } }, wallMask);
  if (!("sprite" in brick)) throw new Error("Missing brick");
  const data = brick.sprite!.frames[0]!.layers.base!;
  for (let y = 2; y < 12; y++) for (let x = 2; x < 20; x++) { expect(data[y * 32 + x]).toBe(data[y * 32 + x + 8]); expect(data[y * 32 + x]).toBe(data[(y + 10) * 32 + x]); }
});

test("materials cannot escape explicit ownership; silhouettes, structure, labels, hardware and anchors remain unchanged", () => {
  for (const [material, sprite, mask] of bindings) {
    const checked = validateSurfaceMask(mask, sprite), result = applyMaterial(sprite, material, mask);
    expect(checked.ok && result.ok).toBe(true);
    if (!("sprite" in result)) throw new Error("Missing sprite");
    const owned = new Map<string, Set<number>>();
    for (const t of checked.targets!) {
      const k = t.surface.frame + ":" + t.surface.layer, pixels = owned.get(k) ?? new Set<number>();
      t.pixels.forEach(p => pixels.add(p)); owned.set(k, pixels);
    }
    for (const frame of sprite.frames) for (const layer of sprite.layers) {
      const before = frame.layers[layer.id]!, after = result.sprite!.frames.find(f => f.id === frame.id)!.layers[layer.id]!;
      before.forEach((c, p) => { if (!owned.get(frame.id + ":" + layer.id)?.has(p)) expect(after[p]).toBe(c); });
    }
    for (const op of result.operations.operations) {
      if (op.op !== "setPixel") throw new Error("Non-pixel operation");
      expect(owned.get(op.frame + ":" + op.layer)!.has(op.y * sprite.width + op.x)).toBe(true);
      expect(Number.isInteger(op.x) && Number.isInteger(op.y)).toBe(true);
    }
    expect(result.sprite!.width).toBe(sprite.width); expect(result.sprite!.height).toBe(sprite.height);
    expect(result.sprite!.palette).toEqual(sprite.palette); expect(result.sprite!.layers).toEqual(sprite.layers); expect(result.sprite!.animations).toEqual(sprite.animations);
    expect(result.sprite!.metadata?.pixelforgeProp).toEqual(sprite.metadata?.pixelforgeProp);
    if (sprite.metadata?.pixelforgeProp) {
      expect(buildProp((sprite.metadata.pixelforgeProp as { source: unknown }).source).rig).toEqual(buildProp((result.sprite!.metadata!.pixelforgeProp as { source: unknown }).source).rig);
    }
    const before = renderFrame(fromDocument(sprite), sprite.frames[0]!.id), after = renderFrame(fromDocument(result.sprite), sprite.frames[0]!.id);
    for (let p = 3; p < before.data.length; p += 4) expect(after.data[p]).toBe(before.data[p]);
  }
  expect(propSurfaceMask(cabinet, ["cabinet-handle-0"]).diagnostics[0]!.code).toBe("PF_MATERIAL_UNSAFE_SURFACE");
});

test("derived sprites and operations validate, palette references stay bounded and sources stay immutable", () => {
  for (const [material, sprite, mask] of bindings) {
    const result = applyMaterial(sprite, material, mask);
    expect(result.ok).toBe(true); expect(operationsSchema.safeParse(result.operations).success).toBe(true);
    if (!("sprite" in result)) throw new Error("Missing sprite");
    expect(projectSchema.safeParse(result.sprite).success).toBe(true);
    const applied = toDocument(applyOperations(fromDocument(sprite), result.operations));
    expect(applied.frames).toEqual(result.sprite!.frames); expect(applied.palette).toEqual(result.sprite!.palette);
    for (const f of result.sprite!.frames) for (const plane of Object.values(f.layers)) expect(plane.every(c => c >= 0 && c < sprite.palette.length)).toBe(true);
    const zero = applyMaterial(sprite, { ...(material as object), intensity: 0 }, mask);
    expect(zero.operations.operations).toEqual([]);
  }
  expect(JSON.stringify({ deskProp, cabinetProp, desk, cabinet, wall, deskMask, cabinetMask, wallMask, materials })).toBe(snapshot);
});

test("invalid masks, palette, settings, density, type and brick spacing fail safely; tiny surfaces warn without clutter", () => {
  const cases: [unknown, unknown, string][] = [
    [materials[0], undefined, "PF_MATERIAL_MASK_REQUIRED"],
    [{ ...materials[0], type: "lava" }, deskMask, "PF_MATERIAL_TYPE_UNSUPPORTED"],
    [{ ...materials[0], seed: -1 }, deskMask, "PF_MATERIAL_SETTINGS_INVALID"],
    [{ ...materials[0], parameters: { ...materials[0].parameters, density: .9 } }, deskMask, "PF_MATERIAL_DENSITY_INVALID"],
    [{ ...materials[0], palette: { ...materials[0].palette, highlight: 255 } }, deskMask, "PF_MATERIAL_PALETTE_INVALID"],
  ];
  const unsafe = structuredClone(deskMask), first = unsafe.surfaces[0]!.protected[0]!;
  unsafe.surfaces[0]!.runs.push({ x: first.x, y: first.y, length: 1 }); cases.push([materials[0], unsafe, "PF_MATERIAL_UNSAFE_SURFACE"]);
  const bounds = structuredClone(deskMask); bounds.surfaces[0]!.runs.push({ x: desk.width, y: 0, length: 1 }); cases.push([materials[0], bounds, "PF_MATERIAL_MASK_BOUNDS"]);
  const stale = structuredClone(deskMask); stale.source.fingerprint = "0000000000000000"; cases.push([materials[0], stale, "PF_MATERIAL_SOURCE_MISMATCH"]);
  const overlap = structuredClone(deskMask); overlap.surfaces[0]!.runs.push({ ...overlap.surfaces[0]!.runs[0]! }); cases.push([materials[0], overlap, "PF_MATERIAL_MASK_OVERLAP"]);
  for (const [material, mask, code] of cases) {
    const result = applyMaterial(desk, material, mask);
    expect(result.ok).toBe(false); expect(result.operations.operations).toEqual([]);
    expect(result.diagnostics.some(d => d.code === code), JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.diagnostics.every(d => d.suggestion.length > 10)).toBe(true);
  }
  const badBrick = applyMaterial(wall, { ...materials[4], parameters: { ...materials[4].parameters, brickHeight: 3, mortarWidth: 3 } }, wallMask);
  expect(badBrick.diagnostics.some(d => d.code === "PF_MATERIAL_BRICK_SPACING")).toBe(true);
  const changed = structuredClone(desk); changed.frames[0]!.layers.supports![0] = 1;
  expect(applyMaterial(changed, materials[0], deskMask).diagnostics.some(d => d.code === "PF_MATERIAL_SOURCE_MISMATCH")).toBe(true);
  const tiny = surfaceMaskFromRegions(wall, { format: "pixelforge-surface-regions", version: "1.0", id: "tiny", surfaces: [{ id: "tiny", frame: "frame-0", layer: "base", regions: [{ x: 2, y: 2, width: 1, height: 2 }] }] });
  if (!("mask" in tiny)) throw new Error("Missing tiny mask");
  const small = applyMaterial(wall, materials[3], tiny.mask);
  expect(small.ok).toBe(true); expect(small.operations.operations).toEqual([]); expect(small.diagnostics[0]!.code).toBe("PF_MATERIAL_SURFACE_SMALL");
  const transparent = surfaceMaskFromRegions(wall, { format: "pixelforge-surface-regions", version: "1.0", id: "unsafe", surfaces: [{ id: "unsafe", frame: "frame-0", layer: "base", regions: [{ x: 0, y: 0, width: 1, height: 1 }] }] });
  expect(transparent.ok).toBe(false); expect(transparent.diagnostics[0]!.code).toBe("PF_MATERIAL_UNSAFE_SURFACE");
});

test("CLI discovers schemas, validates contextual doctor, writes native output and protects all input aliases", () => {
  const temp = mkdtempSync(join(tmpdir(), "pixelforge-material-cli-")), sprite = join(temp, "desk.sprite.json"), mask = join(temp, "desk.mask.json"), variant = join(temp, "variant.json"), ops = join(temp, "ops.json");
  writeFileSync(sprite, JSON.stringify(desk)); const before = readFileSync(sprite);
  const generated = cli("material", "mask", sprite, "--parts", "desk-top-surface,desk-right-drawer-0,desk-right-drawer-1", "--out", mask, "--json");
  expect(generated.status, generated.stderr).toBe(0); expect(read(mask)).toEqual(deskMask);
  expect(cli("material", "mask", sprite, "--parts", "desk-top-surface", "--out", mask).status).toBe(1);
  const request = join(dir, "walnut.material.json"), args = ["material", "apply", request, "--sprite", sprite, "--mask", mask];
  const plain = cli(...args, "--json"); expect(plain.status, plain.stderr).toBe(0); expect(plain.data.outputs).toEqual([]);
  expect(cli(...args, "--out", variant, "--operations-out", ops, "--json").status).toBe(0);
  expect(read(variant)).toEqual(plain.data.sprite); expect(read(ops)).toEqual(plain.data.operations);
  expect(cli(...args, "--out", variant, "--json").status).toBe(1);
  expect(cli(...args, "--out", sprite, "--force", "--json").status).toBe(1);
  const alias = join(temp, "source-alias.json"); linkSync(sprite, alias);
  expect(cli(...args, "--out", alias, "--force", "--json").status).toBe(1);
  expect(cli("doctor", request, "--sprite", sprite, "--mask", mask, "--json").data.ok).toBe(true);
  expect(cli("doctor", mask, "--sprite", sprite, "--json").data.ok).toBe(true);
  expect(cli("doctor", variant, "--json").data.ok).toBe(true);
  const caps = cli("capabilities", "--json").data; expect(caps.runtimeVersion).toBe("0.9.0"); expect(caps.materials.types).toEqual(["wood", "metal", "plaster", "brick", "dither"]);
  expect(cli("capabilities", "--schema", "material").data).toEqual(z.toJSONSchema(materialSchema));
  expect(cli("material", "apply", request, "--sprite", sprite, "--json").data.diagnostics[0].code).toBe("PF_MATERIAL_MASK_REQUIRED");
  expect(readFileSync(sprite)).toEqual(before);
}, 60_000);

test("bounded example produces validated native variants and native/4x nearest-neighbor previews", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "pixelforge-material-preview-")), "evaluation");
  const result = spawnSync(process.execPath, ["examples/procedural-materials/evaluate.mjs", "--out", out], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  const report = read(join(out, "evaluation.json")); expect(report.results).toHaveLength(5);
  const sharp = (await import("sharp")).default;
  for (const r of report.results) {
    expect(r.preflight.ok && r.applied.ok && r.doctor.ok).toBe(true);
    const native = await sharp(r.native.preview).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const preview = await sharp(r.preview.preview).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(preview.info.width).toBe(native.info.width * 4); expect(preview.info.height).toBe(native.info.height * 4);
    for (let y = 0; y < preview.info.height; y++) for (let x = 0; x < preview.info.width; x++) {
      const a = (Math.floor(y / 4) * native.info.width + Math.floor(x / 4)) * 4, b = (y * preview.info.width + x) * 4;
      expect(preview.data.subarray(b, b + 4)).toEqual(native.data.subarray(a, a + 4));
    }
  }
  console.log(JSON.stringify({ evaluation: out, previews: ids.map(id => join(out, `${id}.preview.png`)) }));
}, 60_000);

test("existing props/core/geometry/audio/gaze/expression behavior and all unrelated files remain preserved", () => {
  const baseline = "158deaa97c9da2bbf07434ee6fe0f63154649915", norm = (s: string) => s.replaceAll("\r\n", "\n");
  const files = execFileSync("git", ["ls-tree", "-r", "--name-only", baseline, "packages/core/src", "packages/geometry/src", "packages/audio-core/src"], { encoding: "utf8" }).trim().split(/\r?\n/);
  for (const f of files) {
    const original = norm(execFileSync("git", ["show", `${baseline}:${f}`], { encoding: "utf8" })), current = norm(readFileSync(f, "utf8"));
    if (f.endsWith("/index.ts")) expect(current.startsWith(original)).toBe(true); else expect(current, f).toBe(original);
  }
  const fixture = read("tests/fixtures/semantic-gaze-legacy.json"), rig = read("examples/semantic-pose/clerk.rig.json"), context = { library: read("examples/semantic-pose/clerk.poses.json"), objects: [read("examples/semantic-pose/folder.object.json")] };
  for (const c of fixture.cases) expect(digest(JSON.stringify(resolveSemanticPose(rig, c.request, context)))).toBe(c.sha256);
  expect(resolveSemanticExpression(read("examples/semantic-expression/source.sprite.json"), read("examples/semantic-expression/surprised.expression.json"), read("examples/semantic-expression/face.landmarks.json")).operations.operations).toHaveLength(31);
  expect(resolveProp(deskProp).sprite).toEqual(desk); expect(resolveProp(cabinetProp).sprite).toEqual(cabinet);
  expect(JSON.stringify({ deskProp, cabinetProp, desk, cabinet, wall, deskMask, cabinetMask, wallMask, materials })).toBe(snapshot);
  for (const f of ["package.json", "package-lock.json", ...["core", "exporters", "cli", "geometry", "audio-core", "audio-exporters", "phaser"].map(n => `packages/${n}/package.json`), "apps/web/package.json", "examples/phaser-playground/package.json"]) expect(read(f).version).toBe("0.9.0");
  if (process.env.PIXELFORGE_PRESERVATION_BASELINE) for (const [f, hash] of Object.entries(read(process.env.PIXELFORGE_PRESERVATION_BASELINE))) expect(digest(readFileSync(f)), f).toBe(hash);
});
