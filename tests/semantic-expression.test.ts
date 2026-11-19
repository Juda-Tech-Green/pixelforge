import { test, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import ts from "typescript";
import { z } from "zod";
import { resolveSemanticExpression, semanticExpressionSchema, facialLandmarksSchema, expressionTypes, operationsSchema,
  applyOperations, fromDocument, toDocument, projectSchema, renderFrame } from "@pixelforge/core";
import { resolveSemanticPose, renderRig, restPose, createRig, forwardKinematics } from "@pixelforge/geometry";

const example = resolve("examples/semantic-expression"), read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const source = read(join(example, "source.sprite.json")), landmarks = read(join(example, "face.landmarks.json"));
const tired = read(join(example, "tired.expression.json")), surprised = read(join(example, "surprised.expression.json"));
const snapshot = JSON.stringify({ source, landmarks, tired, surprised });
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const cli = (...args: string[]) => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--conditions=development", "packages/cli/src/index.ts", ...args], { encoding: "utf8" });
  return { ...result, data: result.stdout.trim() ? JSON.parse(result.stdout) : undefined };
};
const solve = (request = tired, face = landmarks, sprite = source) => resolveSemanticExpression(sprite, request, face);

test("valid semantic expressions resolve deterministically with native operations and scoped types", () => {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile), parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const roots = ["packages/core/src/expressions/schema.ts", "packages/core/src/expressions/resolve.ts", "packages/cli/src/expression.ts", "packages/cli/src/agents.ts", "scripts/schemas.ts", "tests/semantic-expression.test.ts"].map(f => resolve(f).replaceAll("\\", "/"));
  const program = ts.createProgram(roots, { ...parsed.options, noEmit: true });
  const errors = ts.getPreEmitDiagnostics(program).filter(d => d.file && roots.some(f => f.toLowerCase() === d.file!.fileName.replaceAll("\\", "/").toLowerCase()));
  expect(errors.map(d => `${d.file!.fileName}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`)).toEqual([]);
  for (const type of expressionTypes) {
    const req = { ...tired, expression: { type, intensity: .8 } }, a = solve(req);
    expect(a.ok, JSON.stringify(a.diagnostics)).toBe(true); expect(a).toEqual(solve(req));
    expect(operationsSchema.safeParse(a.operations).success).toBe(true);
    expect("sprite" in a && projectSchema.safeParse(a.sprite).success).toBe(true);
    expect("sprite" in a && a.sprite).toEqual(toDocument(applyOperations(fromDocument(source), a.operations)));
  }
  expect(read("schemas/semanticExpression.schema.json")).toEqual(z.toJSONSchema(semanticExpressionSchema));
  expect(read("schemas/facialLandmarks.schema.json")).toEqual(z.toJSONSchema(facialLandmarksSchema));
});

test("tired and surprised differ, overrides and existing frame selections support a two-state transition", () => {
  const a = solve(), b = solve({ ...surprised, targets: tired.targets });
  expect(a.ok && b.ok).toBe(true); expect(a.operations.operations.length).toBeGreaterThan(0);
  expect(a.operations).not.toEqual(b.operations);
  expect(b.operations.operations.length).toBeGreaterThan(a.operations.operations.length);
  const first = "sprite" in a ? a.sprite : undefined;
  const second = solve(surprised, landmarks, first);
  expect(second.ok).toBe(true);
  if (!("sprite" in second)) throw new Error("Missing variant");
  expect(second.sprite.frames[0]).toEqual(first!.frames[0]);
  expect(second.sprite.frames[1]).not.toEqual(source.frames[1]);
  expect(second.sprite.animations).toEqual(source.animations);
  const range = solve({ ...tired, targets: source.frames.map((f: { id: string }) => ({ frame: f.id, origin: [7, 4] })) });
  expect(new Set(range.operations.operations.map(o => "frame" in o ? o.frame : ""))).toEqual(new Set(["tired", "surprised"]));
  expect(solve({ ...tired, expression: { type: "neutral", intensity: 1 } }).operations.operations).toEqual([]);
  expect(solve({ ...tired, expression: { type: "surprised", intensity: 0 } }).operations.operations).toEqual([]);
  expect(solve({ ...tired, expression: { type: "neutral", intensity: 0, overrides: { eyeOpen: 1 } } }).operations.operations.length).toBeGreaterThan(0);
});

test("intensity, schema and unsupported frames are rejected without silent repairs", () => {
  for (const intensity of [-.01, 1.01, NaN]) {
    const result = solve({ ...tired, expression: { type: "tired", intensity } });
    expect(result.ok).toBe(false); expect(result.diagnostics.some(d => d.code === "PF_EXPRESSION_INTENSITY_INVALID")).toBe(true);
    expect(result.operations.operations).toEqual([]);
  }
  for (const intensity of [0, 1]) expect(solve({ ...tired, expression: { type: "tired", intensity } }).ok).toBe(true);
  expect(solve({ ...tired, targets: [{ frame: "absent", origin: [7, 4] }] }).diagnostics[0]!.code).toBe("PF_EXPRESSION_FRAME_INVALID");
  expect(solve({ ...tired, targets: [tired.targets[0], tired.targets[0]] }).ok).toBe(false);
  expect(solve({ ...tired, expression: { type: "unknown", intensity: 1 } }).ok).toBe(false);
  expect(solve({ ...tired, expression: { type: "tired", intensity: 1, overrides: { eyeOpen: 2 } } }).ok).toBe(false);
});

test("missing landmarks and unsupported profiles produce corrective stable diagnostics", () => {
  const face = structuredClone(landmarks); delete face.features.rightEye;
  const missing = solve(tired, face);
  expect(missing.ok).toBe(false); expect(missing.diagnostics.find(d => d.code === "PF_FACE_EYE_MISSING")?.suggestion).toContain("visible eye");
  expect(solve(tired, { ...landmarks, profile: "sideways" }).diagnostics[0]!.code).toBe("PF_FACE_PROFILE_UNSUPPORTED");
  expect(solve(tired, { ...landmarks, layer: "surface" }).diagnostics[0]!.code).toBe("PF_FACE_LAYER_INVALID");
  expect(solve(tired, { ...landmarks, profile: "front" }).diagnostics.some(d => d.code === "PF_FACE_EYE_MISSING")).toBe(true);
  const both = structuredClone(landmarks); both.profile = "front";
  both.features.leftEye = { box: { x: 2, y: 7, width: 3, height: 2 }, region: { x: 1, y: 6, width: 5, height: 6 } };
  const two = structuredClone(source);
  for (const frame of two.frames) for (let y = 11; y < 13; y++) for (let x = 9; x < 12; x++) frame.layers.features[y * two.width + x] = 1;
  expect(solve(tired, both, two).ok).toBe(true);
});

test("operations remain inside owned face bounds, preserve alpha/palette and warn on unsafe or quantized changes", () => {
  const result = solve(surprised);
  expect(result.ok).toBe(true);
  for (const op of result.operations.operations) {
    if (op.op !== "setPixel") throw new Error("Unexpected operation");
    expect(Number.isInteger(op.x) && Number.isInteger(op.y)).toBe(true);
    expect(op.layer).toBe("features"); expect(op.frame).toBe("surprised");
    expect(op.x).toBeGreaterThanOrEqual(7); expect(op.x).toBeLessThan(25);
    expect(op.y).toBeGreaterThanOrEqual(4); expect(op.y).toBeLessThan(24);
    if (op.color) expect(source.frames[1].layers.surface[op.y * source.width + op.x]).toBe(2);
  }
  const narrow = structuredClone(landmarks); narrow.features.rightEye.region = { ...narrow.features.rightEye.box };
  const bounded = solve(surprised, narrow);
  expect(bounded.ok).toBe(true); expect(bounded.diagnostics.some(d => d.code === "PF_FACE_MOVEMENT_EXCEEDED")).toBe(true);
  const transparent = structuredClone(source); transparent.frames[1].layers.surface[6 * source.width + 16] = 0;
  expect(solve(surprised, landmarks, transparent).diagnostics.some(d => d.code === "PF_FACE_MOVEMENT_EXCEEDED")).toBe(true);
  const quantized = solve({ ...tired, expression: { type: "tired", intensity: .001 } });
  expect(quantized.diagnostics.some(d => d.code === "PF_EXPRESSION_QUANTIZED")).toBe(true);
  const separation = solve(surprised, { ...landmarks, minSeparation: 8 });
  expect(separation.diagnostics.some(d => d.code === "PF_FACE_SEPARATION")).toBe(true); expect(separation.operations.operations).toEqual([]);
  const outside = solve(tired, { ...landmarks, bounds: { x: 0, y: 0, width: 2, height: 2 } }); expect(outside.ok).toBe(false);
  if (!("sprite" in result)) throw new Error("Missing variant");
  expect(result.sprite.palette).toEqual(source.palette); expect(result.sprite.frames[0]).toEqual(source.frames[0]);
  expect(result.sprite.frames[1]!.layers.surface).toEqual(source.frames[1].layers.surface);
  expect(result.sprite.frames[1]!.layers.body).toEqual(source.frames[1].layers.body);
  const before = renderFrame(fromDocument(source), "surprised"), after = renderFrame(fromDocument(result.sprite), "surprised");
  for (let i = 3; i < before.data.length; i += 4) expect(after.data[i]).toBe(before.data[i]);
});

test("CLI preserves sources, protects aliases, discovers/diagnoses and writes editable preview demonstration", () => {
  const out = mkdtempSync(join(tmpdir(), "pixelforge-expression-verification-"));
  const args = ["sprite", "expression", "resolve", join(example, "tired.expression.json"), "--sprite", join(example, "source.sprite.json"), "--landmarks", join(example, "face.landmarks.json")];
  const readonly = cli(...args, "--json"); expect(readonly.status, readonly.stderr).toBe(0); expect(readonly.data.outputs).toEqual([]);
  const variant = join(out, "variant.json"), ops = join(out, "ops.json");
  expect(cli(...args, "--out", variant, "--operations-out", ops, "--json").status).toBe(0);
  expect(read(variant)).toEqual(toDocument(applyOperations(fromDocument(source), read(ops))));
  expect(cli(...args, "--out", variant, "--json").status).toBe(1);
  expect(cli(...args, "--out", join(example, "source.sprite.json"), "--force", "--json").status).toBe(1);
  const alias = join(out, "alias.json"); linkSync(join(example, "source.sprite.json"), alias);
  expect(cli(...args, "--out", alias, "--force", "--json").status).toBe(1);
  const caps = cli("capabilities", "--json").data;
  expect(caps.runtimeVersion).toBe("0.8.3"); expect(caps.semanticExpressions.expressions).toEqual([...expressionTypes]);
  expect(caps.assetTypes.some((a: { type: string }) => a.type === "facialLandmarks")).toBe(true);
  const doc = cli("doctor", join(example, "tired.expression.json"), "--sprite", join(example, "source.sprite.json"), "--landmarks", join(example, "face.landmarks.json"), "--json");
  expect(doc.status, doc.stderr).toBe(0); expect(doc.data.ok).toBe(true);
  const invalid = join(out, "invalid.json"); writeFileSync(invalid, JSON.stringify({ ...tired, expression: { type: "tired", intensity: 2 } }));
  expect(cli("doctor", invalid, "--json").data.diagnostics[0].code).toBe("PF_EXPRESSION_INTENSITY_INVALID");
  const localRig = { version: "1.0", id: "face-rig", name: "Face FK", canvas: { width: 32, height: 32 }, palette: source.palette,
    layers: ["surface", "features"], joints: [{ id: "skull", parent: null, position: [7, 4] }], shapes: [
      { id: "surface", type: "polygon", joint: "skull", layer: "surface", color: 2, points: [[0, 0], [17, 0], [17, 19], [0, 19]] },
      ...Object.entries(landmarks.features).map(([id, feature]) => {
        const b = (feature as { box: { x: number; y: number; width: number; height: number } }).box;
        return { id, type: "ellipse", joint: "skull", layer: "features", color: 1, offset: [b.x + (b.width - 1) / 2, b.y + (b.height - 1) / 2], radius: [b.width / 2, b.height / 2] };
      })] };
  const localPose = { id: "tired", rotations: {} }, fkSource = toDocument(renderRig(localRig, localPose).project);
  const fkFiles = ["rig.json", "pose.json", "sprite.json", "request.json"].map(f => join(out, f));
  [localRig, localPose, fkSource, { ...tired, targets: [{ frame: "tired" }] }].forEach((data, i) => writeFileSync(fkFiles[i]!, JSON.stringify(data)));
  const fk = cli("sprite", "expression", "resolve", fkFiles[3]!, "--sprite", fkFiles[2]!, "--landmarks", join(example, "face.landmarks.json"), "--rig", fkFiles[0]!, "--pose", fkFiles[1]!, "--joint", "skull", "--json");
  expect(fk.status, fk.stderr || JSON.stringify(fk.data?.diagnostics)).toBe(0);
  expect(fk.data.provenance.transform).toEqual([1, 0, 0, 1, 7, 4]);
  const demo = join(out, "evaluation");
  const run = spawnSync(process.execPath, ["examples/semantic-expression/evaluate.mjs", "--out", demo], { encoding: "utf8" });
  expect(run.status, run.stderr).toBe(0);
  expect(read(join(demo, "reaction.contact.json"))).toBeTruthy();
  expect(readFileSync(join(demo, "reaction.png")).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  console.log(JSON.stringify({ evaluation: demo, contact: join(demo, "reaction.png"), preview: join(demo, "surprised.png") }));
  expect(JSON.stringify({ source, landmarks, tired, surprised })).toBe(snapshot);
  expect(read(join(example, "source.sprite.json"))).toEqual(source);
}, 60_000);

test("published sprite/rig/semantic/gaze engines stay byte-identical, local FK works and unrelated changes survive", () => {
  const baseline = "a21ab52068b758295a9855d7147610d66872e1d2";
  const files = execFileSync("git", ["ls-tree", "-r", "--name-only", baseline, "packages/core/src", "packages/geometry/src"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(f => f !== "packages/core/src/index.ts");
  for (const f of files) expect(readFileSync(f, "utf8").replaceAll("\r\n", "\n"), f).toBe(execFileSync("git", ["show", `${baseline}:${f}`], { encoding: "utf8" }).replaceAll("\r\n", "\n"));
  const fixture = read("tests/fixtures/semantic-gaze-legacy.json"), rig = read("examples/semantic-pose/clerk.rig.json"), context = { library: read("examples/semantic-pose/clerk.poses.json"), objects: [read("examples/semantic-pose/folder.object.json")] };
  for (const c of fixture.cases) expect(hash(JSON.stringify(resolveSemanticPose(rig, c.request, context)))).toBe(c.sha256);
  const anatomical = resolveSemanticPose(rig, read("examples/semantic-pose/gaze-anatomical.semantic-pose.json"), context);
  expect(anatomical.ok).toBe(true); expect(anatomical.pose!.rotations.head).toBe(.35); expect(anatomical.pose!.rotations.neck).toBe(.2);
  const minimal = createRig("standard", "expression"), pose = restPose(minimal);
  const raster = renderRig(minimal, pose); expect(projectSchema.safeParse(toDocument(raster.project)).success).toBe(true);
  // Supply the exact same matrix shape as solved head FK: translation, reflection and quarter-turn are deterministic.
  for (const matrix of [[1, 0, 0, 1, 7, 4], [-1, 0, 0, 1, 24, 4], [0, 1, -1, 0, 26, 5]] as [number, number, number, number, number, number][]) {
    const rotated = structuredClone(source); rotated.frames[0].layers.features.fill(0); rotated.frames[0].layers.surface.fill(2);
    for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) if (source.frames[0].layers.features[y * source.width + x]) {
      const lx = x - 7, ly = y - 4, xx = matrix[0] * lx + matrix[2] * ly + matrix[4], yy = matrix[1] * lx + matrix[3] * ly + matrix[5];
      rotated.frames[0].layers.features[yy * source.width + xx] = 1;
    }
    const req = { ...tired, targets: [{ frame: "tired" }] };
    const a = resolveSemanticExpression(rotated, req, landmarks, matrix);
    expect(a.ok, JSON.stringify(a.diagnostics)).toBe(true); expect(a.operations.operations.length).toBeGreaterThan(0);
  }
  expect(forwardKinematics(minimal, pose).head!.matrix).toHaveLength(6);
  const versions = ["package.json", ...["core", "exporters", "cli", "phaser", "geometry", "audio-core", "audio-exporters"].map(n => `packages/${n}/package.json`), "apps/web/package.json", "examples/phaser-playground/package.json"];
  for (const file of versions) expect(read(file).version).toBe("0.8.3");
  expect(read("package-lock.json").version).toBe("0.8.3");
  if (process.env.PIXELFORGE_PRESERVATION_BASELINE) for (const [file, digest] of Object.entries(read(process.env.PIXELFORGE_PRESERVATION_BASELINE))) expect(hash(readFileSync(file)), file).toBe(digest);
});
