import { test, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, linkSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { z } from "zod";
import ts from "typescript";
import { roomSchema, roomLayers, resolveRoom, renderRoom, sceneSchema, validateScene, depthOrder, renderScene,
  resolveProp, propSurfaceMask, resolveSemanticPose } from "@pixelforge/geometry";
import { createProject, applyOperations, fromDocument, toDocument, applyMaterial, surfaceMaskFromRegions,
  surfaceRegionsSchema, projectSchema, renderFrame, resolveSemanticExpression, type ProjectDocument } from "@pixelforge/core";
const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const dir = resolve("examples/semantic-room"), a = read(join(dir, "layout-a.room.json")), b = read(join(dir, "layout-b.room.json"));
function preparedProp(prop: string, material: string, parts: string[]): ProjectDocument {
  const sprite = resolveProp(read(prop)).sprite!, mask = propSurfaceMask(sprite, parts);
  if (!("mask" in mask)) throw new Error("Missing mask");
  const result = applyMaterial(sprite, read(material), mask.mask);
  if (!result.ok || !("sprite" in result) || !result.sprite) throw new Error(JSON.stringify(result.diagnostics));
  return result.sprite;
}
const desk = preparedProp("examples/procedural-materials/desk.prop.json", "examples/procedural-materials/walnut.material.json", ["desk-top-surface", "desk-right-drawer-0", "desk-right-drawer-1"]);
const cabinet = preparedProp("examples/procedural-materials/cabinet.prop.json", "examples/procedural-materials/brushed-olive.material.json", ["cabinet-drawer-0", "cabinet-drawer-1", "cabinet-drawer-2", "cabinet-drawer-3"]);
const windowSprite = resolveProp(read("examples/parametric-props/office-window.prop.json")).sprite!;
const wallBase = toDocument(applyOperations(createProject({ name: "Office wall", width: 192, height: 74, palette: read("examples/procedural-materials/wall.palette.json") }), read(join(dir, "wall.ops.json"))));
const wallMask = surfaceMaskFromRegions(wallBase, read(join(dir, "wall.regions.json")));
if (!("mask" in wallMask)) throw new Error("Missing wall mask");
const wallResult = applyMaterial(wallBase, read(join(dir, "wall.material.json")), wallMask.mask);
if (!("sprite" in wallResult) || !wallResult.sprite) throw new Error("Missing wall");
const sources = { desk, cabinet, window: windowSprite, wall: wallResult.sprite };
const snapshot = JSON.stringify({ a, b, sources });
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
function cli(...args: string[]) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--conditions=development", "packages/cli/src/index.ts", ...args], { encoding: "utf8" });
  return { ...result, data: result.stdout.trim() ? JSON.parse(result.stdout) : undefined };
}

test("room contract/type checks and anchor resolution are deterministic and use declared source anchors", () => {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile), parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const roots = ["packages/geometry/src/room-schema.ts", "packages/geometry/src/room.ts", "packages/geometry/src/index.ts", "packages/cli/src/room.ts", "packages/cli/src/agents.ts", "packages/cli/src/index.ts", "scripts/schemas.ts", "tests/semantic-room.test.ts"].map(f => resolve(f).replaceAll("\\", "/"));
  const program = ts.createProgram(roots, { ...parsed.options, noEmit: true });
  const errors = ts.getPreEmitDiagnostics(program).filter(d => d.file && roots.some(f => f.toLowerCase() === d.file!.fileName.replaceAll("\\", "/").toLowerCase()));
  expect(errors.map(d => `${d.file!.fileName}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`)).toEqual([]);
  expect(read("schemas/room.schema.json")).toEqual(z.toJSONSchema(roomSchema));
  const result = resolveRoom(a, sources);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true); expect(result).toEqual(resolveRoom(a, sources));
  expect(result.anchors!["room.wall.center"]).toEqual([95, 36]); expect(result.anchors!["room.floor.left"]).toEqual([0, 92]); expect(result.anchors!["room.floor.right"]).toEqual([191, 92]);
  expect(result.instances!.find(i => i.id === "cabinet")!.position).toEqual([12, 41]);
  expect(result.instances!.find(i => i.id === "desk")!.position).toEqual([80, 56]);
  expect(result.instances!.find(i => i.id === "window")!.position).toEqual([76, 11]);
  expect(result.instances!.find(i => i.id === "desk")!.anchors.ground).toEqual([105, 90]);
  expect(result.placementOrder).toEqual(["cabinet", "desk", "window"]);
});

test("instance dependency order and rendering layers/depth/ID are stable rather than inferred from screen Y", () => {
  const result = resolveRoom(a, sources), reordered = structuredClone(a); reordered.instances.reverse();
  const other = resolveRoom(reordered, sources);
  expect(other.scene).toEqual(result.scene); expect(other.placementOrder).toEqual(result.placementOrder);
  expect(result.renderOrder).toEqual(["room-floor", "room-wall", "room-wall-image", "window", "cabinet", "desk"]);
  const tied = structuredClone(a);
  tied.instances = [{ id: "zz", asset: "desk", layer: "furniture", placement: { position: [10, 20] } }, { id: "aa", asset: "desk", layer: "furniture", placement: { position: [100, 60] } }];
  const ordered = resolveRoom(tied, sources);
  expect(ordered.ok).toBe(true); expect(ordered.renderOrder!.indexOf("aa")).toBeLessThan(ordered.renderOrder!.indexOf("zz"));
  expect(depthOrder(ordered.scene).filter(p => ["aa", "zz"].includes(p.id)).map(p => p.depth)).toEqual([0, 0]);
  tied.instances[0].depth = -2;
  expect(resolveRoom(tied, sources).renderOrder!.indexOf("zz")).toBeLessThan(resolveRoom(tied, sources).renderOrder!.indexOf("aa"));
  expect(roomLayers).toEqual(["architecture", "background-furniture", "furniture", "actors", "foreground"]);
});

test("one resource supports multiple independent instances and explicit prop references normalize once per asset", () => {
  const room = structuredClone(a);
  room.instances = [{ id: "left-desk", asset: "desk", layer: "furniture", placement: { position: [10, 60] } }, { id: "right-desk", asset: "desk", layer: "furniture", placement: { position: [105, 60] } }];
  const result = resolveRoom(room, sources);
  expect(result.ok).toBe(true); expect(result.instances!.map(i => i.position)).toEqual([[10, 60], [105, 60]]);
  expect(result.scene!.objects.filter(o => o.type === "room-instance").map(o => o.sprite!.asset)).toEqual(["desk", "desk"]);
  expect(result.resources!.desk).toEqual(desk);
  const prop = read("examples/procedural-materials/desk.prop.json");
  room.assets.desk = { source: "desk.prop.json", type: "prop" };
  const plain = resolveRoom(room, { ...sources, desk: prop });
  expect(plain.ok).toBe(true); expect(plain.resources!.desk).toEqual(resolveProp(prop).sprite);
  expect(plain.instances!.every(i => i.sourceType === "prop" && i.source === "desk.prop.json")).toBe(true);
  expect(Object.keys(plain.resources!).filter(id => id === "desk")).toHaveLength(1);
});

test("translation preserves materialized RGBA pixels, transparency and provenance in both layouts", () => {
  for (const room of [a, b]) {
    const result = renderRoom(resolveRoom(room, sources)); expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    for (const instance of result.instances!) {
      const source = sources[instance.asset as keyof typeof sources], original = renderFrame(fromDocument(source), instance.frame);
      const isolated = structuredClone(result.sprite!); isolated.layers.forEach(l => { l.visible = l.id === instance.id; });
      const raster = renderFrame(fromDocument(isolated), "scene-000");
      for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
        const before = (y * source.width + x) * 4, after = ((instance.position[1] + y) * raster.width + instance.position[0] + x) * 4;
        expect(raster.data.subarray(after, after + 4)).toEqual(original.data.subarray(before, before + 4));
      }
      expect(instance.provenance.metadata).toEqual(source.metadata); expect(result.resources![instance.asset]).toEqual(source);
    }
  }
  expect(JSON.stringify({ a, b, sources })).toBe(snapshot);
});

test("cycles, missing/ambiguous references, unsafe bounds, transforms and conflicting placements have corrective diagnostics", () => {
  const cases: [unknown, string][] = [];
  const cycle = structuredClone(a); cycle.instances[2].placement = { anchor: "desk.ground", align: "ground" }; cases.push([cycle, "PF_ROOM_PLACEMENT_CYCLE"]);
  const missing = structuredClone(a); missing.instances[1].placement.anchor = "ghost.ground"; cases.push([missing, "PF_ROOM_INSTANCE_MISSING"]);
  const anchor = structuredClone(a); anchor.instances[1].placement.anchor = "cabinet.handle"; cases.push([anchor, "PF_ROOM_ANCHOR_MISSING"]);
  const missingAsset = structuredClone(a); missingAsset.instances[1].asset = "unknown"; cases.push([missingAsset, "PF_ROOM_ASSET_MISSING"]);
  const layer = structuredClone(a); layer.instances[1].layer = "unknown"; cases.push([layer, "PF_ROOM_LAYER_INVALID"]);
  const canvas = structuredClone(a); canvas.canvas.width = 0; cases.push([canvas, "PF_ROOM_CANVAS_INVALID"]);
  const duplicate = structuredClone(a); duplicate.instances.push(duplicate.instances[0]); cases.push([duplicate, "PF_ROOM_INSTANCE_DUPLICATE"]);
  const transform = structuredClone(a); transform.instances[1].transform = { scale: 2 }; cases.push([transform, "PF_ROOM_TRANSFORM_UNSUPPORTED"]);
  const conflict = structuredClone(a); conflict.instances[1].placement.position = [0, 0]; cases.push([conflict, "PF_ROOM_PLACEMENT_CONFLICT"]);
  const off = structuredClone(a); off.instances[1].placement = { position: [-1, 10] }; cases.push([off, "PF_ROOM_OFF_CANVAS"]);
  const ambiguous = structuredClone(a); ambiguous.assets.desk.anchors = { ground: [1, 1] }; cases.push([ambiguous, "PF_ROOM_ANCHOR_AMBIGUOUS"]);
  for (const [room, code] of cases) {
    const result = resolveRoom(room, sources); expect(result.ok).toBe(false); expect(result.scene).toBeUndefined();
    expect(result.diagnostics.some(d => d.code === code), JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.diagnostics.every(d => d.path.startsWith("$") && d.suggestion.length > 10)).toBe(true);
  }
  off.instances[1].allowClipping = true;
  const clipped = renderRoom(resolveRoom(off, sources)); expect(clipped.ok).toBe(true); expect(clipped.diagnostics.some(d => d.code === "PF_ROOM_OFF_CANVAS" && d.severity === "warning")).toBe(true);
  expect(resolveRoom(a, { ...sources, desk: {} }).diagnostics.some(d => d.code === "PF_ROOM_SPRITE_INVALID")).toBe(true);
  const frames = structuredClone(desk); frames.frames.push({ ...frames.frames[0]!, id: "other" });
  expect(resolveRoom(a, { ...sources, desk: frames }).diagnostics.some(d => d.code === "PF_ROOM_FRAME_AMBIGUOUS")).toBe(true);
  const missingGround = structuredClone(cabinet); delete missingGround.metadata;
  expect(resolveRoom(a, { ...sources, cabinet: missingGround }).diagnostics.some(d => d.code === "PF_ROOM_ANCHOR_MISSING")).toBe(true);
  const smallWall = toDocument(createProject({ name: "Wrong wall", width: 12, height: 12 }));
  expect(resolveRoom(a, { ...sources, wall: smallWall }).diagnostics.some(d => d.code === "PF_ROOM_BACKGROUND_SIZE")).toBe(true);
});

test("resolved manifest uses the actual scene validator/renderer and exposes a material-compatible background boundary", () => {
  const result = renderRoom(resolveRoom(a, sources)); expect(result.ok).toBe(true);
  expect(sceneSchema.safeParse(result.scene).success).toBe(true); expect(projectSchema.safeParse(result.sprite).success).toBe(true);
  const resources = Object.fromEntries(Object.entries(result.resources!).map(([id, doc]) => [id, fromDocument(doc)]));
  expect(validateScene(result.scene, resources)).toEqual([]);
  const existing = toDocument(renderScene(result.scene, resources).project);
  expect(existing.frames).toEqual(result.sprite!.frames); expect(existing.palette).toEqual(result.sprite!.palette);
  expect(surfaceRegionsSchema.safeParse(result.backgroundRegions).success).toBe(true);
  const mask = surfaceMaskFromRegions(result.sprite, result.backgroundRegions); expect(mask.ok, JSON.stringify(mask.diagnostics)).toBe(true);
  if (!("mask" in mask)) throw new Error("Missing background mask");
  expect(mask.mask!.surfaces.map(s => s.id)).toEqual(["wall", "floor"]);
  expect(result.sprite!.metadata!.pixelforgeRoom).toBeTruthy();
});

test("CLI reads relative declared paths, writes protected native outputs, exposes discovery/doctor and preserves source files", () => {
  const temp = mkdtempSync(join(tmpdir(), "pixelforge-room-cli-")); mkdirSync(join(temp, "assets"));
  const files = Object.entries(sources).map(([id, doc]) => { const file = join(temp, "assets", `${id}.sprite.json`); writeFileSync(file, JSON.stringify(doc)); return [id, file] as const; });
  const request = join(temp, "office.room.json"); writeFileSync(request, JSON.stringify(a));
  const before = Object.fromEntries([request, ...files.map(f => f[1])].map(f => [f, hash(readFileSync(f))]));
  const plain = cli("room", "resolve", request, "--json"); expect(plain.status, plain.stderr).toBe(0); expect(plain.data.outputs).toEqual([]);
  const scene = join(temp, "office.scene.json"), sprite = join(temp, "office.sprite.json"), mapping = join(temp, "mapping.json"), resources = join(temp, "resources.json");
  expect(cli("room", "resolve", request, "--out", scene, "--sprite", sprite, "--mapping-out", mapping, "--resources-out", resources, "--json").status).toBe(0);
  expect(sceneSchema.safeParse(read(scene)).success).toBe(true); expect(projectSchema.safeParse(read(sprite)).success).toBe(true);
  expect(read(mapping).sourceFiles).toHaveLength(4); expect(Object.keys(read(resources)).sort()).toEqual(["cabinet", "desk", "wall", "window"]);
  for (const f of read(mapping).sourceFiles) expect(f.sha256).toBe(hash(readFileSync(f.path)));
  expect(cli("room", "resolve", request, "--out", scene).status).toBe(1);
  expect(cli("room", "resolve", request, "--out", request, "--force").status).toBe(1);
  const alias = join(temp, "alias.json"); linkSync(files[0]![1], alias);
  expect(cli("room", "resolve", request, "--out", alias, "--force").status).toBe(1);
  expect(cli("doctor", request, "--json").data.ok).toBe(true);
  const caps = cli("capabilities", "--json").data; expect(caps.runtimeVersion).toBe("0.9.0"); expect(caps.rooms.layers).toEqual([...roomLayers]); expect(caps.rooms.anchors).toHaveLength(6);
  expect(cli("capabilities", "--schema", "room").data).toEqual(z.toJSONSchema(roomSchema));
  const invalid = structuredClone(a); invalid.assets.desk.source = "missing.sprite.json";
  const bad = join(temp, "missing.room.json"); writeFileSync(bad, JSON.stringify(invalid));
  expect(cli("doctor", bad, "--json").data.diagnostics.some((d: { code: string }) => d.code === "PF_ROOM_ASSET_MISSING")).toBe(true);
  for (const [file, digest] of Object.entries(before)) expect(hash(readFileSync(file))).toBe(digest);
}, 60_000);

test("two example layouts move the same immutable assets without rebuilding them; prior engines and dirty files survive", () => {
  const out = join(mkdtempSync(join(tmpdir(), "pixelforge-room-preview-")), "evaluation");
  const run = spawnSync(process.execPath, ["examples/semantic-room/evaluate.mjs", "--out", out], { encoding: "utf8" });
  expect(run.status, run.stderr).toBe(0);
  const evidence = read(join(out, "evaluation.json")); expect(evidence.preparedOnce).toBe(true); expect(evidence.before).toEqual(evidence.after);
  expect(evidence.commands.filter((c: { stage: string }) => c.stage === "compose-layouts").every((c: { args: string[] }) => !["prop", "material"].includes(c.args[0]!))).toBe(true);
  const [first, second] = evidence.results;
  for (const r of evidence.results) { expect(r.resolution.ok && r.doctor.ok && r.spriteDoctor.ok && r.sceneDoctor.ok).toBe(true); expect(readFileSync(r.preview.preview).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a"); }
  expect(first.resolution.resources).toEqual(second.resolution.resources);
  for (const id of ["desk", "cabinet"]) expect(first.resolution.instances.find((i: { id: string }) => i.id === id).position).not.toEqual(second.resolution.instances.find((i: { id: string }) => i.id === id).position);
  expect(first.resolution.instances.find((i: { id: string }) => i.id === "window").position).toEqual(second.resolution.instances.find((i: { id: string }) => i.id === "window").position);
  console.log(JSON.stringify({ evaluation: out, previews: evidence.results.map((r: { preview: { preview: string } }) => r.preview.preview) }));
  const baseline = "158deaa97c9da2bbf07434ee6fe0f63154649915", norm = (s: string) => s.replaceAll("\r\n", "\n");
  const oldFiles = execFileSync("git", ["ls-tree", "-r", "--name-only", baseline, "packages/core/src", "packages/geometry/src", "packages/audio-core/src"], { encoding: "utf8" }).trim().split(/\r?\n/);
  for (const file of oldFiles) { const current = norm(readFileSync(file, "utf8")), original = norm(execFileSync("git", ["show", `${baseline}:${file}`], { encoding: "utf8" })); if (file.endsWith("/index.ts")) expect(current.startsWith(original)).toBe(true); else expect(current, file).toBe(original); }
  const legacy = read("tests/fixtures/semantic-gaze-legacy.json"), rig = read("examples/semantic-pose/clerk.rig.json"), context = { library: read("examples/semantic-pose/clerk.poses.json"), objects: [read("examples/semantic-pose/folder.object.json")] };
  for (const c of legacy.cases) expect(hash(JSON.stringify(resolveSemanticPose(rig, c.request, context)))).toBe(c.sha256);
  expect(resolveSemanticExpression(read("examples/semantic-expression/source.sprite.json"), read("examples/semantic-expression/surprised.expression.json"), read("examples/semantic-expression/face.landmarks.json")).operations.operations).toHaveLength(31);
  for (const file of ["package.json", "package-lock.json", ...["core", "exporters", "cli", "geometry", "phaser", "audio-core", "audio-exporters"].map(n => `packages/${n}/package.json`), "apps/web/package.json", "examples/phaser-playground/package.json"]) expect(read(file).version).toBe("0.9.0");
  expect(JSON.stringify({ a, b, sources })).toBe(snapshot);
  if (process.env.PIXELFORGE_PRESERVATION_BASELINE) for (const [file, digest] of Object.entries(read(process.env.PIXELFORGE_PRESERVATION_BASELINE))) expect(hash(readFileSync(file)), file).toBe(digest);
}, 60_000);
