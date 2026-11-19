import { test, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { createProp, resolveProp, propSurfaceMask, parametricPropSchema, resolveRoom, renderRoom, roomSchema,
  sceneSchema, validateScene, renderScene } from "@pixelforge/geometry";
import { applyMaterial, materialSchema, surfaceMaskSchema, projectSchema, fromDocument, toDocument, renderFrame, applyOperations } from "@pixelforge/core";

test("v0.9.0 integrates prop → explicit mask → deterministic material → immutable room translation", () => {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile), parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const roots = ["packages/geometry/src/prop-schema.ts", "packages/geometry/src/props.ts", "packages/geometry/src/prop-surfaces.ts", "packages/geometry/src/room-schema.ts", "packages/geometry/src/room.ts", "packages/cli/src/agents.ts", "packages/cli/src/index.ts", "packages/cli/src/props.ts", "packages/cli/src/materials.ts", "packages/cli/src/room.ts", "packages/core/src/materials/schema.ts", "packages/core/src/materials/masks.ts", "packages/core/src/materials/apply.ts", "tests/parametric-environments.integration.test.ts"].map(f => resolve(f).replaceAll("\\", "/"));
  const program = ts.createProgram(roots, { ...parsed.options, noEmit: true });
  const errors = ts.getPreEmitDiagnostics(program).filter(d => d.file && roots.some(f => f.toLowerCase() === d.file!.fileName.replaceAll("\\", "/").toLowerCase()));
  expect(errors.map(d => `${d.file!.fileName}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`)).toEqual([]);

  const prop = createProp("desk", "release-desk"), propBytes = JSON.stringify(prop);
  const generated = resolveProp(prop);
  expect(generated.ok, JSON.stringify(generated.diagnostics)).toBe(true);
  expect(parametricPropSchema.safeParse(prop).success).toBe(true);
  const source = generated.sprite!, sourceBytes = JSON.stringify(source);
  const ownership = propSurfaceMask(source, ["desk-top-surface", "desk-right-drawer-0", "desk-right-drawer-1"]);
  if (!ownership.ok || !("mask" in ownership)) throw new Error(JSON.stringify(ownership.diagnostics));
  expect(surfaceMaskSchema.safeParse(ownership.mask).success).toBe(true);
  const material = { format: "pixelforge-material", version: "1.0", id: "release-walnut", type: "wood", seed: 1953,
    palette: { base: 2, highlight: 3, shadow: 4 }, parameters: { direction: "horizontal", scale: 1, density: .25, variation: .2, wear: .03 } };
  expect(materialSchema.safeParse(material).success).toBe(true);
  const finish = applyMaterial(source, material, ownership.mask);
  expect(finish.ok, JSON.stringify(finish.diagnostics)).toBe(true);
  expect(finish).toEqual(applyMaterial(source, material, ownership.mask));
  expect(finish.operations.operations.length).toBeGreaterThan(0);
  if (!("sprite" in finish) || !finish.sprite) throw new Error("Missing editable material variant");
  const textured = finish.sprite, variantBytes = JSON.stringify(textured);
  expect(projectSchema.safeParse(textured).success).toBe(true);
  expect(toDocument(applyOperations(fromDocument(source), finish.operations)).frames).toEqual(textured.frames);

  const room = { format: "pixelforge-room", version: "1.0", id: "release-office", name: "Release integration office", canvas: { width: 128, height: 80 },
    palette: [[0, 0, 0, 0], [190, 181, 159, 255], [113, 99, 76, 255]], background: { wallHeight: 44, wallColor: 1, floorColor: 2 },
    assets: { desk: { source: "materialized.sprite.json", type: "sprite" } },
    instances: [{ id: "desk", asset: "desk", layer: "furniture", placement: { anchor: "room.floor.center", align: "ground", offset: [0, 0] } }] };
  expect(roomSchema.safeParse(room).success).toBe(true);
  const shifted = structuredClone(room); shifted.instances[0]!.placement.offset = [22, 0];
  const first = renderRoom(resolveRoom(room, { desk: textured })), second = renderRoom(resolveRoom(shifted, { desk: textured }));
  for (const result of [first, second]) {
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    expect(sceneSchema.safeParse(result.scene).success).toBe(true); expect(projectSchema.safeParse(result.sprite).success).toBe(true);
    const resources = Object.fromEntries(Object.entries(result.resources!).map(([id, doc]) => [id, fromDocument(doc)]));
    expect(validateScene(result.scene, resources)).toEqual([]);
    expect(toDocument(renderScene(result.scene, resources).project).frames).toEqual(result.sprite!.frames);
    const mapping = result.instances![0]!;
    expect(mapping.sourceType).toBe("sprite"); expect(mapping.provenance.metadata!.pixelforgeMaterial).toEqual(textured.metadata!.pixelforgeMaterial);
    const isolated = structuredClone(result.sprite!); isolated.layers.forEach(layer => { layer.visible = layer.id === "desk"; });
    const actual = renderFrame(fromDocument(isolated), "scene-000"), expected = renderFrame(fromDocument(textured), textured.frames[0]!.id);
    for (let y = 0; y < textured.height; y++) for (let x = 0; x < textured.width; x++) {
      const a = ((mapping.position[1] + y) * actual.width + mapping.position[0] + x) * 4, b = (y * textured.width + x) * 4;
      expect(actual.data.subarray(a, a + 4)).toEqual(expected.data.subarray(b, b + 4));
    }
  }
  expect(first.instances![0]!.position).not.toEqual(second.instances![0]!.position);
  expect(first.resources).toEqual(second.resources); expect(first.resources!.desk).toEqual(textured);
  expect(first.instances![0]!.provenance.sourceLayout).toBe(second.instances![0]!.provenance.sourceLayout);
  expect(generated.rig).toEqual(resolveProp(prop).rig); expect(JSON.stringify(prop)).toBe(propBytes);
  expect(JSON.stringify(source)).toBe(sourceBytes); expect(JSON.stringify(textured)).toBe(variantBytes);

  // Exercise real CLI file loading without generating artwork or writing back to inputs.
  const out = mkdtempSync(join(tmpdir(), "pixelforge-v090-integration-"));
  const propFile = join(out, "desk.prop.json"), originalFile = join(out, "source.sprite.json"), variantFile = join(out, "materialized.sprite.json"), roomFile = join(out, "office.room.json");
  [[propFile, propBytes], [originalFile, sourceBytes], [variantFile, variantBytes], [roomFile, JSON.stringify(room)]].forEach(([file, text]) => writeFileSync(file!, text!));
  const files = [propFile, originalFile, variantFile, roomFile], hash = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex"), before = files.map(hash);
  const command = spawnSync(process.execPath, ["--import", "tsx", "--conditions=development", "packages/cli/src/index.ts", "room", "resolve", roomFile, "--json"], { encoding: "utf8" });
  expect(command.status, command.stderr).toBe(0); const result = JSON.parse(command.stdout); expect(result.ok).toBe(true); expect(result.outputs).toEqual([]);
  const doctor = spawnSync(process.execPath, ["--import", "tsx", "--conditions=development", "packages/cli/src/index.ts", "doctor", roomFile, "--json"], { encoding: "utf8" });
  expect(doctor.status, doctor.stderr).toBe(0); expect(JSON.parse(doctor.stdout).ok).toBe(true); expect(files.map(hash)).toEqual(before);
  if (process.env.PIXELFORGE_PRESERVATION_BASELINE) {
    const preserved = JSON.parse(readFileSync(process.env.PIXELFORGE_PRESERVATION_BASELINE, "utf8"));
    for (const [file, digest] of Object.entries(preserved)) expect(hash(file), file).toBe(digest);
  }
}, 60_000);
