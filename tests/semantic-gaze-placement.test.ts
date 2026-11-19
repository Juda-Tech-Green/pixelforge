import { test, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import ts from "typescript";
import { z } from "zod";
import { resolveSemanticPose, forwardKinematics, restPose, parseRig, poseSchema, affine, compose, transform,
  wrapAngle, semanticPoseSchema, heldObjectSchema } from "@pixelforge/geometry";

const directory = resolve("examples/semantic-pose");
const names = ["clerk.rig.json", "clerk.poses.json", "folder.object.json", "hold.semantic-pose.json", "gaze-relative.semantic-pose.json"];
const bytes = Object.fromEntries(names.map(n => [n, readFileSync(join(directory, n), "utf8")]));
const rig = JSON.parse(bytes["clerk.rig.json"]!), library = JSON.parse(bytes["clerk.poses.json"]!), object = JSON.parse(bytes["folder.object.json"]!),
  legacy = JSON.parse(bytes["hold.semantic-pose.json"]!), example = JSON.parse(bytes["gaze-relative.semantic-pose.json"]!);
const context = { library, objects: [object] }, snapshot = JSON.stringify({ rig, library, object, legacy, example });
const bare = { format: "pixelforge-semantic-pose", version: "1.0", id: "gaze", rig: rig.id };
const versionFiles = ["package.json", "package-lock.json", ...["core", "exporters", "cli", "geometry", "phaser", "audio-core", "audio-exporters"].map(n => `packages/${n}/package.json`), "apps/web/package.json", "examples/phaser-playground/package.json"];
const versionBytes = versionFiles.map(f => readFileSync(f, "utf8"));
function cli(...args: string[]) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--conditions=development", "packages/cli/src/index.ts", ...args], { encoding: "utf8" });
  return { ...result, data: result.stdout.trim() ? JSON.parse(result.stdout) : undefined };
}
test("world gaze is deterministic across facing, forward references, strength and limits", () => {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile), parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const roots = ["packages/geometry/src/semantic.ts", "packages/geometry/src/semantic-schema.ts", "packages/cli/src/semantic.ts", "scripts/schemas.ts", "tests/semantic-gaze-placement.test.ts"].map(p => resolve(p).replaceAll("\\", "/"));
  const program = ts.createProgram(roots, { ...parsed.options, noEmit: true });
  const errors = ts.getPreEmitDiagnostics(program).filter(d => d.file && roots.some(p => p.toLowerCase() === d.file!.fileName.replaceAll("\\", "/").toLowerCase()));
  expect(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
  for (const facing of ["right", "left"] as const) {
    const base = restPose(parseRig(rig)); base.facing = facing;
    const origin = forwardKinematics(rig, base).head!.position;
    const request = { ...bare, overrides: { facing }, gaze: { forward: [1, 0], target: { type: "coordinate", space: "world", position: [origin[0] + (facing === "right" ? 10 : -10), origin[1] + 10] } } };
    const a = resolveSemanticPose(rig, request), b = resolveSemanticPose(rig, request);
    expect(a.ok, JSON.stringify(a.diagnostics)).toBe(true); expect(a).toEqual(b);
    expect(a.gaze!.appliedAngle).toBeCloseTo(Math.PI / 4); expect(a.gaze!.directionError).toBeLessThan(1e-9);
  }
  const head = forwardKinematics(rig, restPose(parseRig(rig))).head!.position;
  const nonHorizontal = resolveSemanticPose(rig, { ...bare, gaze: { forward: [0, -1], target: { type: "coordinate", space: "world", position: [head[0] + 10, head[1] + 10] } } });
  expect(nonHorizontal.gaze!.appliedAngle).toBeCloseTo(3 * Math.PI / 4);
  const tilted = structuredClone(library); tilted.poses[0].rotations.head = .4;
  const partial = resolveSemanticPose(rig, { ...bare, basePose: "idle", gaze: { forward: [1, 0], strength: .5, target: { type: "coordinate", space: "world", position: [head[0] + 10, head[1]] } } }, { library: tilted });
  expect(partial.gaze!.appliedAngle).toBeCloseTo(.2);
  const limited = resolveSemanticPose(rig, { ...bare, gaze: { forward: [1, 0], limits: [-.2, .2], target: { type: "coordinate", space: "world", position: [head[0], head[1] + 10] } } });
  expect(limited.gaze!.appliedAngle).toBe(.2); expect(limited.diagnostics.some(d => d.code === "PF_GAZE_LIMIT")).toBe(true);
});
test("named held-object anchor uses the final attached world position and mapped head", () => {
  const result = resolveSemanticPose(rig, example, context);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  const expectedTarget = transform(object.anchors.support, result.placement!.matrix);
  expect(result.gaze!.targetWorld).toEqual(expectedTarget);
  const world = forwardKinematics(rig, result.pose), neck = world.neck!;
  const desiredWorld = Math.atan2(expectedTarget[1] - result.gaze!.headOrigin[1], expectedTarget[0] - result.gaze!.headOrigin[0]);
  expect(result.gaze!.appliedAngle).toBeCloseTo(wrapAngle(desiredWorld - neck.angle));
  expect(result.gaze!.directionError).toBeLessThan(1e-9);
  const mapped = structuredClone(rig);
  for (const joint of mapped.joints) { if (joint.id === "head") joint.id = "skull"; if (joint.parent === "head") joint.parent = "skull"; }
  for (const shape of mapped.shapes) { if (shape.joint === "head") shape.joint = "skull"; if (shape.type === "bone" && shape.end === "head") shape.end = "skull"; }
  const custom = resolveSemanticPose(mapped, { ...bare, roles: { head: "skull" }, gaze: { forward: [1, 0], target: { type: "role", role: "chest" } } });
  expect(custom.ok, JSON.stringify(custom.diagnostics)).toBe(true); expect(custom.gaze!.joint).toBe("skull");
  expect(custom.gaze!.directionError).toBeLessThan(1e-9);
});
test("joint-local placement respects parent rotation, reflection and object-local anchors", () => {
  for (const facing of ["right", "left"] as const) {
    const request = { ...legacy, posture: { type: "neutral", strength: 0 }, overrides: { facing, rotations: { pelvis: .4 } },
      attachment: { ...legacy.attachment, placement: { space: "joint-local", joint: "chest", offset: [10, 6], rotation: -.2 } } };
    const result = resolveSemanticPose(rig, request, context);
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    const base = restPose(parseRig(rig)); base.facing = facing; base.rotations.pelvis = .4;
    const parent = forwardKinematics(rig, base).chest!, expected = compose(parent.matrix, affine([10, 6], -.2));
    expect(result.placement!.worldPosition).toEqual(transform([10, 6], parent.matrix));
    expect(result.placement!.gripPosition).toEqual(transform(object.anchors.grip, expected));
    expect(result.placement!.objectRotation).toBeCloseTo(Math.atan2(expected[1], expected[0]));
    expect(result.placement!.matrix[0] * result.placement!.matrix[3] - result.placement!.matrix[1] * result.placement!.matrix[2]).toBeCloseTo(facing === "right" ? 1 : -1);
  }
  const localObject = { ...object, transform: { space: "joint-local", role: "chest", offset: [10, 6], rotation: -.2 } };
  const fromObject = resolveSemanticPose(rig, legacy, { library, objects: [localObject] });
  const fromRequest = resolveSemanticPose(rig, { ...legacy, attachment: { ...legacy.attachment, placement: localObject.transform } }, context);
  expect(fromObject.ok).toBe(true); expect(fromObject.pose).toEqual(fromRequest.pose); expect(fromObject.rig).toEqual(fromRequest.rig);
});
test("posture placement IK and gaze compose without changing the sandwich pipeline", () => {
  const result = resolveSemanticPose(rig, example, context);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  expect(poseSchema.safeParse(result.pose).success).toBe(true); expect(result.pose!.rotations.spine).toBeCloseTo(.104);
  expect(result.hands[0]!.reachable).toBe(true); expect(result.hands[0]!.residual).toBeLessThan(1e-5);
  expect(result.attachment!.reachedGrip).toEqual(result.hands[0]!.reached);
  expect(result.attachment!.layers).toEqual(["semantic-grip-palm", "semantic-grip-object", "semantic-grip-front"]);
  expect(result.gaze!.directionError).toBeLessThan(1e-9);
  expect(result.rig!.joints).toEqual(rig.joints); // Same proportions, positions and limits.
  const far = resolveSemanticPose(rig, { ...example, attachment: { ...example.attachment, placement: { ...example.attachment.placement, offset: [200, 200] } } }, context);
  expect(far.ok).toBe(true); expect(far.diagnostics.some(d => d.code === "PF_HAND_UNREACHABLE")).toBe(true);
  expect(far.gaze!.directionError).toBeLessThan(1e-9); // Aim at the reached prop, not its unreachable intended position.
});
test("legacy requests match the published v0.8.1 resolver including serialization", () => {
  // Execute the actual published baseline as an oracle; do not copy a second solver into the repo.
  const original = execFileSync("git", ["show", "798bd344a343b2c8e4dbe25fa9d98e71a5be7c8d:packages/geometry/src/semantic.ts"], { encoding: "utf8" });
  const text = original.replace(/from "\.\/(.*?)\.js"/g, (_match, name: string) => `from ${JSON.stringify(pathToFileURL(resolve("packages/geometry/src", `${name}.ts`)).href)}`);
  const temp = mkdtempSync(join(tmpdir(), "pixelforge-v081-oracle-"));
  writeFileSync(join(temp, "baseline.mjs"), ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
  const requests = [legacy, bare, { ...legacy, overrides: { facing: "left" } }, { ...bare, hands: { right: { target: { type: "coordinate", space: "world", position: [44, 36] } } } }];
  writeFileSync(join(temp, "inputs.json"), JSON.stringify({ rig, requests, context }));
  writeFileSync(join(temp, "run.mjs"), `import{readFileSync}from'node:fs';import{resolveSemanticPose}from'./baseline.mjs';const x=JSON.parse(readFileSync(new URL('inputs.json',import.meta.url)));console.log(JSON.stringify(x.requests.map(r=>resolveSemanticPose(x.rig,r,x.context))));`);
  const baseline = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--conditions=development", join(temp, "run.mjs")], { encoding: "utf8" }));
  for (const [i, request] of requests.entries()) expect(JSON.stringify(resolveSemanticPose(rig, request, context))).toBe(JSON.stringify(baseline[i]));
});
test("invalid gaze placement and circular references produce actionable diagnostics", () => {
  const coordinate = { type: "coordinate", space: "world", position: [45, 35] };
  const cases = [
    [{ ...bare, gaze: { target: coordinate } }, "PF_GAZE_FORWARD_MISSING"],
    [{ ...bare, roles: { head: "missing" }, gaze: { forward: [1, 0], target: coordinate } }, "PF_GAZE_ROLE_MISSING"],
    [{ ...bare, gaze: { forward: [1, 0], target: { type: "joint", id: "missing" } } }, "PF_GAZE_TARGET_UNKNOWN"],
    [{ ...example, gaze: { ...example.gaze, target: { type: "object-anchor", object: "folder", anchor: "missing" } } }, "PF_ANCHOR_MISSING"],
    [{ ...example, attachment: { ...example.attachment, placement: { space: "joint-local", joint: "missing", offset: [1, 2], rotation: 0 } } }, "PF_PLACEMENT_JOINT_MISSING"],
    [{ ...example, attachment: { ...example.attachment, placement: { space: "joint-local", role: "rightWrist", offset: [1, 2], rotation: 0 } } }, "PF_SEMANTIC_CYCLE"],
    [{ ...bare, gaze: { forward: [1, 0], target: { type: "joint", id: "head" } } }, "PF_SEMANTIC_CYCLE"],
    [{ ...example, overrides: { rotations: { head: .1 } } }, "PF_GAZE_ROTATION_CONFLICT"],
    [{ ...example, attachment: { ...example.attachment, placement: { space: "screen", position: [1, 2], rotation: 0 } } }, "PF_SEMANTIC_SCHEMA"],
    [{ ...example, gaze: { ...example.gaze, limits: [1, -1] } }, "PF_GAZE_LIMITS_INVALID"],
  ];
  for (const [request, expected] of cases) {
    const result = resolveSemanticPose(rig, request, context);
    expect(result.ok, String(expected)).toBe(false);
    expect(result.diagnostics.some(d => d.code === expected && d.path.startsWith("$") && d.message && d.suggestion)).toBe(true);
  }
});
test("CLI schemas doctor rig rendering and preview preserve sources and version metadata", () => {
  const caps = cli("capabilities", "--json"); expect(caps.status, caps.stderr).toBe(0);
  expect(caps.data.runtimeVersion).toBe("0.8.3"); expect(caps.data.semanticPosing.extensions.gaze.targets).toContain("object-anchor");
  for (const [name, schema] of Object.entries({ semanticPose: semanticPoseSchema, heldObject: heldObjectSchema })) {
    expect(cli("capabilities", "--schema", name).data).toEqual(z.toJSONSchema(schema));
    expect(JSON.parse(readFileSync(`schemas/${name}.schema.json`, "utf8"))).toEqual(z.toJSONSchema(schema));
  }
  const args = [join(directory, "gaze-relative.semantic-pose.json"), "--rig", join(directory, "clerk.rig.json"), "--library", join(directory, "clerk.poses.json"), "--object", join(directory, "folder.object.json")];
  const readonly = cli("rig", "resolve-pose", ...args, "--json"); expect(readonly.status, readonly.stderr).toBe(0); expect(readonly.data.outputs).toEqual([]);
  expect(cli("doctor", ...args, "--json").data.ok).toBe(true);
  const temp = mkdtempSync(join(tmpdir(), "pixelforge-v082-result-")), pose = join(temp, "resolved.pose.json"), derived = join(temp, "resolved.rig.json");
  const written = cli("rig", "resolve-pose", ...args, "--out", pose, "--out-rig", derived, "--json"); expect(written.status, written.stderr).toBe(0);
  expect(cli("rig", "resolve-pose", ...args, "--out", pose, "--out-rig", derived).status).toBe(1);
  expect(cli("doctor", pose, "--rig", derived, "--json").data.ok).toBe(true);
  const sprite = join(temp, "resolved.sprite.json"), png = join(temp, "render.png"), preview = join(temp, "preview.png");
  const render = cli("rig", "render", derived, "--pose", pose, "--sprite", sprite, "--output", png); expect(render.status, render.stderr).toBe(0);
  expect(cli("preview", sprite, "--out", preview, "--json").status).toBe(0);
  for (const n of names) expect(readFileSync(join(directory, n), "utf8")).toBe(bytes[n]);
  expect(JSON.stringify({ rig, library, object, legacy, example })).toBe(snapshot);
  for (const [index, file] of versionFiles.entries()) expect(readFileSync(file, "utf8")).toBe(versionBytes[index]);
  if (process.env.PIXELFORGE_PRESERVATION_BASELINE) {
    const hashes = JSON.parse(readFileSync(process.env.PIXELFORGE_PRESERVATION_BASELINE, "utf8"));
    for (const [file, hash] of Object.entries(hashes)) expect(createHash("sha256").update(readFileSync(file)).digest("hex"), file).toBe(hash);
  }
  writeFileSync(join(temp, "resolution-report.json"), JSON.stringify({ gaze: written.data.gaze, placement: written.data.placement, hands: written.data.hands, diagnostics: written.data.diagnostics }, null, 2));
  console.log(JSON.stringify({ temp, pose, derived, png, preview }));
});
