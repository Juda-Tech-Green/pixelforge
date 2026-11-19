import { test, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import ts from "typescript";
import { z } from "zod";
import { resolveSemanticPose, parseRig, restPose, forwardKinematics, transform, wrapAngle, createRig, semanticPoseSchema } from "@pixelforge/geometry";

const folder = resolve("examples/semantic-pose");
const load = (name: string) => JSON.parse(readFileSync(join(folder, name), "utf8"));
const rig = load("clerk.rig.json"), library = load("clerk.poses.json"), object = load("folder.object.json");
const legacy = load("gaze-relative.semantic-pose.json"), example = load("gaze-anatomical.semantic-pose.json");
const context = { library, objects: [object] };
const bare = { format: "pixelforge-semantic-pose", version: "1.0", id: "anatomical-test", rig: rig.id };
const versions = ["package.json", "package-lock.json", ...["core", "cli", "geometry", "exporters", "phaser", "audio-core", "audio-exporters"].map(n => `packages/${n}/package.json`), "apps/web/package.json", "examples/phaser-playground/package.json"];
const versionBytes = versions.map(f => readFileSync(f, "utf8"));
const sources = ["clerk.rig.json", "clerk.poses.json", "folder.object.json", "hold.semantic-pose.json", "gaze-relative.semantic-pose.json", "gaze-anatomical.semantic-pose.json"];
const sourceBytes = sources.map(f => readFileSync(join(folder, f), "utf8"));
const snapshot = JSON.stringify({ rig, library, object, legacy, example });
function cli(...args: string[]) {
  const r = spawnSync(process.execPath, ["--import", "tsx", "--conditions=development", "packages/cli/src/index.ts", ...args], { encoding: "utf8" });
  return { ...r, data: r.stdout.trim() ? JSON.parse(r.stdout) : undefined };
}
test("legacy v0.8.1 and v0.8.2 serialized outputs and explicit legacy mode remain exact", () => {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile), options = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd()).options;
  const roots = ["packages/geometry/src/anatomical-gaze.ts", "packages/geometry/src/semantic.ts", "packages/geometry/src/semantic-schema.ts", "tests/anatomical-gaze.test.ts"].map(f => resolve(f).replaceAll("\\", "/"));
  const program = ts.createProgram(roots, { ...options, noEmit: true });
  const errors = ts.getPreEmitDiagnostics(program).filter(d => d.file && roots.some(f => f.toLowerCase() === d.file!.fileName.replaceAll("\\", "/").toLowerCase()));
  expect(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
  const baseline = JSON.parse(readFileSync("tests/fixtures/semantic-gaze-legacy.json", "utf8"));
  expect(createHash("sha256").update(readFileSync(join(folder, "clerk.rig.json"))).digest("hex")).toBe(baseline.rigSourceSha256);
  for (const entry of baseline.cases) {
    const result = resolveSemanticPose(rig, entry.request, context);
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    expect(createHash("sha256").update(JSON.stringify(result)).digest("hex")).toBe(entry.sha256);
    if (entry.request.gaze) {
      const explicit = resolveSemanticPose(rig, { ...entry.request, gaze: { ...entry.request.gaze, mode: "legacy" } }, context);
      expect(JSON.stringify(explicit)).toBe(JSON.stringify(result));
    }
  }
});
test("anatomical correction distributes deterministically with configurable normalized weights", () => {
  const base = restPose(parseRig(rig)), head = forwardKinematics(rig, base).head!;
  const position = transform([100 * Math.cos(.2), 100 * Math.sin(.2)], head.matrix);
  const request = { ...bare, gaze: { mode: "anatomical", forward: [1, 0], target: { type: "coordinate", space: "world", position }, anatomy: { neckWeight: .2, headWeight: .6 } } };
  const result = resolveSemanticPose(rig, request);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true); expect(result).toEqual(resolveSemanticPose(rig, request));
  const metadata = result.gaze!.anatomical!;
  expect(metadata.normalizedWeights.neck).toBeCloseTo(.25); expect(metadata.normalizedWeights.head).toBeCloseTo(.75);
  expect(metadata.neck.appliedDelta).toBeCloseTo(.05); expect(metadata.head.appliedDelta).toBeGreaterThan(.1);
  expect(result.gaze!.directionError).toBeLessThan(1e-8);
  const headOnly = resolveSemanticPose(rig, { ...request, gaze: { ...request.gaze, anatomy: { neckWeight: 0, headWeight: 1 } } });
  expect(headOnly.gaze!.anatomical!.neck.appliedDelta).toBe(0); expect(headOnly.gaze!.appliedAngle).toBeCloseTo(.2);
});
test("joint-specific profile limits intersect tighter rig and gaze restrictions", () => {
  const tight = structuredClone(rig);
  tight.joints.find((j: { id: string }) => j.id === "neck").limits = [-.07, .07];
  tight.joints.find((j: { id: string }) => j.id === "head").limits = [-.08, .08];
  const result = resolveSemanticPose(tight, { ...example, gaze: { ...example.gaze, limits: [-.06, .06], anatomy: { neckLimits: [-.3, .3], headLimits: [-.4, .4] } } }, context);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  expect(result.gaze!.anatomical!.neck.limits).toEqual([-.07, .07]); expect(result.gaze!.anatomical!.head.limits).toEqual([-.06, .06]);
  expect(result.pose!.rotations.neck).toBeCloseTo(.07); expect(result.pose!.rotations.head).toBeCloseTo(.06);
  expect(result.gaze!.anatomical!.neck.atLimit).toBe(true); expect(result.gaze!.anatomical!.head.atLimit).toBe(true);
  expect(result.diagnostics.some(d => d.code === "PF_GAZE_LIMIT_REACHED" && d.severity === "warning")).toBe(true);
});
test("low target keeps hands attachment and torso unchanged and reports honest rendered residual", () => {
  const bounded = resolveSemanticPose(rig, example, context), full = resolveSemanticPose(rig, legacy, context);
  expect(bounded.ok, JSON.stringify(bounded.diagnostics)).toBe(true);
  expect(bounded.pose!.rotations.neck).toBeCloseTo(.2); expect(bounded.pose!.rotations.head).toBeCloseTo(.35);
  expect(full.pose!.rotations.head).toBeGreaterThan(1.3);
  expect(bounded.hands).toEqual(full.hands); expect(bounded.attachment).toEqual(full.attachment);
  expect(bounded.placement).toEqual(full.placement); expect(bounded.rig).toEqual(full.rig);
  for (const [id, angle] of Object.entries(full.pose!.rotations)) if (id !== "neck" && id !== "head") expect(bounded.pose!.rotations[id]).toBe(angle);
  const world = forwardKinematics(rig, bounded.pose), origin = world.head!.position, target = bounded.gaze!.targetWorld;
  const forward = [world.head!.matrix[0], world.head!.matrix[1]];
  const actualError = Math.abs(wrapAngle(Math.atan2(target[1] - origin[1], target[0] - origin[0]) - Math.atan2(forward[1]!, forward[0]!)));
  expect(bounded.gaze!.headOrigin).toEqual(origin); expect(bounded.gaze!.directionError).toBeCloseTo(actualError);
  expect(actualError).toBeGreaterThan(.5); expect(bounded.gaze!.anatomical!.renderedDirectionError).toBeCloseTo(actualError, 12);
  expect(bounded.gaze!.anatomical!.reason).toBe("joint-limits");
  expect(bounded.diagnostics.some(d => d.code === "PF_GAZE_TARGET_UNREACHABLE" && d.severity === "warning")).toBe(true);
});
test("custom and missing anatomy require explicit or meaningful existing limits", () => {
  const missing = resolveSemanticPose(rig, { ...bare, roles: { neck: "missing" }, gaze: { ...example.gaze, target: { type: "coordinate", space: "world", position: [45, 30] } } });
  expect(missing.ok).toBe(false); expect(missing.diagnostics.some(d => d.code === "PF_GAZE_ANATOMY_UNAVAILABLE")).toBe(true);
  const animal = createRig("quadruped", "animal"), gaze = { ...example.gaze, target: { type: "coordinate", space: "world", position: [55, 40] } };
  const unavailable = resolveSemanticPose(animal, { ...bare, rig: animal.id, gaze });
  expect(unavailable.ok).toBe(false); expect(unavailable.diagnostics.some(d => d.code === "PF_GAZE_ANATOMY_UNAVAILABLE")).toBe(true);
  const explicit = resolveSemanticPose(animal, { ...bare, rig: animal.id, gaze: { ...gaze, anatomy: { neckLimits: [-.1, .1], headLimits: [-.2, .2] } } });
  expect(explicit.ok, JSON.stringify(explicit.diagnostics)).toBe(true); expect(explicit.gaze!.anatomical!.profileSource.neck).toBe("explicit-profile");
  animal.joints.find(j => j.id === "neck")!.limits = [-.1, .1]; animal.joints.find(j => j.id === "head")!.limits = [-.2, .2];
  const authored = resolveSemanticPose(animal, { ...bare, rig: animal.id, gaze });
  expect(authored.ok).toBe(true); expect(authored.gaze!.anatomical!.profileSource.head).toBe("rig");
  for (const anatomy of [{ neckWeight: 0, headWeight: 0 }, { neckLimits: [.2, -.2] }, { neckWeight: -1 }]) {
    const invalid = resolveSemanticPose(rig, { ...example, gaze: { ...example.gaze, anatomy } }, context);
    expect(invalid.ok).toBe(false); expect(invalid.diagnostics.some(d => d.code === "PF_GAZE_PROFILE_INVALID" && d.suggestion)).toBe(true);
  }
  const cyclic = resolveSemanticPose(rig, { ...example, attachment: { ...example.attachment, placement: { space: "joint-local", role: "neck", offset: [10, 6], rotation: 0 } } }, context);
  expect(cyclic.diagnostics.some(d => d.code === "PF_SEMANTIC_CYCLE")).toBe(true);
});
test("mirrored facing nonhorizontal forward and rotated base poses use local FK conventions", () => {
  for (const facing of ["right", "left"] as const) {
    const poses = structuredClone(library), initialPose = poses.poses[0];
    initialPose.rotations.neck = .1; initialPose.rotations.head = .15; initialPose.facing = facing;
    const head = forwardKinematics(rig, initialPose).head!, position = transform([100 * Math.sin(.1), -100 * Math.cos(.1)], head.matrix);
    const result = resolveSemanticPose(rig, { ...bare, basePose: "idle", gaze: { mode: "anatomical", forward: [0, -1], target: { type: "coordinate", space: "world", position } } }, { library: poses });
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.gaze!.anatomical!.initialCorrection).toBeCloseTo(.1);
    expect(result.gaze!.anatomical!.neck.initialRotation).toBe(.1); expect(result.gaze!.anatomical!.head.initialRotation).toBe(.15);
    expect(result.gaze!.directionError).toBeLessThan(1e-8);
  }
});
test("capabilities doctor and existing preview pipeline support anatomical mode without source changes", () => {
  const capabilities = cli("capabilities", "--json"); expect(capabilities.status, capabilities.stderr).toBe(0);
  expect(capabilities.data.runtimeVersion).toBe("0.8.3"); expect(capabilities.data.semanticPosing.extensions.gaze.modes).toEqual(["legacy", "anatomical"]);
  expect(capabilities.data.semanticPosing.extensions.gaze.defaultMode).toBe("legacy");
  expect(cli("capabilities", "--schema", "semanticPose").data).toEqual(z.toJSONSchema(semanticPoseSchema));
  expect(JSON.parse(readFileSync("schemas/semanticPose.schema.json", "utf8"))).toEqual(z.toJSONSchema(semanticPoseSchema));
  const args = [join(folder, "gaze-anatomical.semantic-pose.json"), "--rig", join(folder, "clerk.rig.json"), "--library", join(folder, "clerk.poses.json"), "--object", join(folder, "folder.object.json")];
  const readonly = cli("rig", "resolve-pose", ...args, "--json"); expect(readonly.status, readonly.stderr).toBe(0); expect(readonly.data.outputs).toEqual([]);
  const doctor = cli("doctor", ...args, "--json"); expect(doctor.status, doctor.stderr).toBe(0); expect(doctor.data.diagnostics.some((d: { code: string }) => d.code === "PF_GAZE_TARGET_UNREACHABLE")).toBe(true);
  const temp = mkdtempSync(join(tmpdir(), "pixelforge-anatomical-result-")), pose = join(temp, "anatomical.pose.json"), derived = join(temp, "anatomical.rig.json");
  const written = cli("rig", "resolve-pose", ...args, "--out", pose, "--out-rig", derived, "--json"); expect(written.status, written.stderr).toBe(0);
  const sprite = join(temp, "anatomical.sprite.json"), png = join(temp, "render.png"), preview = join(temp, "preview.png");
  const render = cli("rig", "render", derived, "--pose", pose, "--sprite", sprite, "--output", png); expect(render.status, render.stderr).toBe(0);
  expect(cli("preview", sprite, "--out", preview, "--json").status).toBe(0);
  expect(cli("doctor", pose, "--rig", derived, "--json").data.ok).toBe(true);
  for (const [i, f] of sources.entries()) expect(readFileSync(join(folder, f), "utf8")).toBe(sourceBytes[i]);
  for (const [i, f] of versions.entries()) expect(readFileSync(f, "utf8")).toBe(versionBytes[i]);
  expect(JSON.stringify({ rig, library, object, legacy, example })).toBe(snapshot);
  if (process.env.PIXELFORGE_PRESERVATION_BASELINE) {
    const hashes = JSON.parse(readFileSync(process.env.PIXELFORGE_PRESERVATION_BASELINE, "utf8"));
    for (const [f, hash] of Object.entries(hashes)) expect(createHash("sha256").update(readFileSync(f)).digest("hex"), f).toBe(hash);
  }
  const full = resolveSemanticPose(rig, legacy, context);
  writeFileSync(join(temp, "comparison.json"), JSON.stringify({ legacy: full.gaze, anatomical: written.data.gaze, hands: written.data.hands, attachment: written.data.attachment, diagnostics: written.data.diagnostics }, null, 2));
  console.log(JSON.stringify({ temp, pose, derived, preview }));
});
