import { test, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import ts from "typescript";
import { renderFrame } from "@pixelforge/core";
import { resolveSemanticPose, poseSchema, parseRig, forwardKinematics, renderRig, createRig, restPose } from "@pixelforge/geometry";
const dir = resolve("examples/semantic-pose");
const sourceFiles = ["clerk.rig.json", "clerk.poses.json", "folder.object.json", "hold.semantic-pose.json"];
const original = Object.fromEntries(sourceFiles.map(f => [f, readFileSync(join(dir, f), "utf8")]));
const rig = JSON.parse(original["clerk.rig.json"]!), library = JSON.parse(original["clerk.poses.json"]!),
  object = JSON.parse(original["folder.object.json"]!), request = JSON.parse(original["hold.semantic-pose.json"]!);
const snapshot = JSON.stringify({ rig, library, object, request });
const context = { library, objects: [object] };
const simple = { format: "pixelforge-semantic-pose", version: "1.0", id: "resolved", rig: rig.id, posture: { type: "slumped", strength: .65 } };
function cli(...args: string[]) {
  const r = spawnSync(process.execPath, ["--import", "tsx", "--conditions=development", "packages/cli/src/index.ts", ...args], { encoding: "utf8" });
  return { ...r, data: r.stdout.trim() ? JSON.parse(r.stdout) : undefined };
}
test("slumped posture is deterministic, bounded and reports missing anatomy", () => {
  // Check only the touched semantic modules, not the monorepo's test/build targets.
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const roots = ["packages/geometry/src/semantic-schema.ts", "packages/geometry/src/semantic.ts", "packages/cli/src/semantic.ts", "packages/cli/src/agents.ts", "packages/cli/src/geometry.ts", "examples/semantic-pose/create-fixtures.ts", "tests/semantic-pose.test.ts"].map(p => resolve(p).replaceAll("\\", "/"));
  const program = ts.createProgram(roots, { ...parsed.options, noEmit: true });
  const errors = ts.getPreEmitDiagnostics(program).filter(d => d.file && roots.some(p => p.toLowerCase() === d.file!.fileName.replaceAll("\\", "/").toLowerCase()));
  expect(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
  const a = resolveSemanticPose(rig, simple), b = resolveSemanticPose(rig, simple);
  expect(a.ok, JSON.stringify(a.diagnostics)).toBe(true); expect(a).toEqual(b);
  expect(a.pose!.rotations.spine).toBeCloseTo(.16 * .65);
  const zero = resolveSemanticPose(rig, { ...simple, posture: { type: "slumped", strength: 0 } });
  expect(zero.pose!.rotations).toEqual(restPose(parseRig(rig)).rotations);
  for (const type of ["neutral", "upright", "lean_forward"]) expect(resolveSemanticPose(rig, { ...simple, posture: { type, strength: 1 } }).ok).toBe(true);
  const quadruped = createRig("quadruped", "animal");
  expect(resolveSemanticPose(quadruped, { ...simple, rig: "animal" }).diagnostics.some(d => d.code === "PF_ANATOMY_MISSING")).toBe(true);
  const remapped = structuredClone(rig);
  for (const j of remapped.joints) { j.id = `x-${j.id}`; if (j.parent) j.parent = `x-${j.parent}`; if (j.mirror) j.mirror = `x-${j.mirror}`; }
  for (const s of remapped.shapes) { s.joint = `x-${s.joint}`; if (s.type === "bone") s.end = `x-${s.end}`; }
  expect(resolveSemanticPose(remapped, { ...simple, roles: { spine: "x-spine", chest: "x-chest", neck: "x-neck" } }).ok).toBe(true);
});
test("hand targets reuse IK, preserve bone lengths and yield valid poses in both coordinate spaces", () => {
  for (const target of [{ type: "coordinate", space: "world", position: [44, 36] },
    { type: "coordinate", space: "joint-local", joint: "chest", position: [8, 6] }]) {
    const resolved = resolveSemanticPose(rig, { ...simple, hands: { right: { target } } });
    expect(resolved.ok, JSON.stringify(resolved.diagnostics)).toBe(true);
    expect(poseSchema.safeParse(resolved.pose).success).toBe(true);
    expect(resolved.hands[0]!.reachable).toBe(true); expect(resolved.hands[0]!.residual).toBeLessThan(1e-5);
    const world = forwardKinematics(rig, resolved.pose);
    for (const id of ["right-elbow", "right-wrist"]) {
      const j = rig.joints.find((j: { id: string }) => j.id === id);
      expect(Math.hypot(world[id]!.position[0] - world[j.parent]!.position[0], world[id]!.position[1] - world[j.parent]!.position[1])).toBeCloseTo(Math.hypot(...j.position));
    }
  }
  const contactLibrary = structuredClone(library);
  contactLibrary.poses[0].targets = [{ id: "desk-contact", root: "right-shoulder", middle: "right-elbow", end: "right-wrist", position: [44, 36], bend: 1 }];
  const named = resolveSemanticPose(rig, { ...simple, basePose: "idle", hands: { right: { target: { type: "contact", id: "desk-contact" } } } }, { library: contactLibrary });
  expect(named.hands[0]!.reachable).toBe(true);
});
test("unreachable targets report target, reached wrist, residual, chain and rotations", () => {
  const resolved = resolveSemanticPose(rig, { ...simple, hands: { right: { target: { type: "coordinate", space: "world", position: [500, 500] } } } });
  expect(resolved.ok).toBe(true);
  expect(resolved.diagnostics).toContainEqual(expect.objectContaining({ code: "PF_HAND_UNREACHABLE", severity: "warning", suggestion: expect.stringContaining("closer") }));
  expect(resolved.hands[0]).toMatchObject({ target: [500, 500], reachable: false, chain: { end: "right-wrist" }, rotations: expect.any(Object) });
  expect(resolved.hands[0]!.residual).toBeGreaterThan(100);
});
test("missing objects, anchors, contacts and front-hand geometry fail actionably", () => {
  const cases = [
    [request, { library }, "PF_OBJECT_MISSING"],
    [{ ...request, attachment: { ...request.attachment, grip: "missing" } }, context, "PF_ANCHOR_MISSING"],
    [{ ...simple, hands: { right: { target: { type: "contact", id: "missing" } } } }, {}, "PF_CONTACT_MISSING"],
    [{ ...request, attachment: { ...request.attachment, occlusion: { ...request.attachment.occlusion, frontShapes: ["missing"] } } }, context, "PF_GRIP_GEOMETRY_MISSING"],
  ] as const;
  for (const [req, ctx, code] of cases) { const r = resolveSemanticPose(rig, req, ctx); expect(r.ok).toBe(false); expect(r.diagnostics.some(d => d.code === code && d.suggestion.length > 0)).toBe(true); }
});
test("attachment positioning and explicit palm/object/front order are deterministic and rendered", () => {
  const a = resolveSemanticPose(rig, request, context), b = resolveSemanticPose(rig, request, context);
  expect(a.ok, JSON.stringify(a.diagnostics)).toBe(true); expect(a).toEqual(b);
  expect(a.attachment!.reachedGrip).toEqual(a.hands[0]!.reached);
  expect(a.rig!.layers.filter(l => rig.layers.includes(l))).toEqual(rig.layers);
  expect(a.attachment!.layers).toEqual(["semantic-grip-palm", "semantic-grip-object", "semantic-grip-front"]);
  expect(a.rig!.shapes.find(s => s.id === "right-hand-shape")!.layer).toBe("semantic-grip-palm");
  expect(a.rig!.shapes.find(s => s.id === "grip-overlay")!.layer).toBe("semantic-grip-front");
  const rendered = renderRig(a.rig, a.pose).project, frame = renderFrame(rendered, a.pose!.id);
  const [x, y] = a.hands[0]!.reached.map(Math.round), at = (y! * frame.width + x!) * 4;
  expect([...frame.data.slice(at, at + 4)]).toEqual(rig.palette[3]);
  const secondary = resolveSemanticPose(rig, { ...request, attachment: { ...request.attachment, secondaryGrip: { hand: "left", anchor: "support" } } }, context);
  expect(secondary.ok, JSON.stringify(secondary.diagnostics)).toBe(true); expect(secondary.hands).toHaveLength(2);
  const mirrored = resolveSemanticPose(rig, { ...request, overrides: { facing: "left" } }, context);
  expect(mirrored.ok, JSON.stringify(mirrored.diagnostics)).toBe(true);
});
test("CLI discovery, doctor, output protection and rendered examples preserve every source", () => {
  const caps = cli("capabilities", "--json"); expect(caps.status, caps.stderr).toBe(0);
  expect(caps.data.runtimeVersion).toBe("0.8.3"); expect(caps.data.semanticPosing.postures).toContain("slumped");
  const schema = cli("capabilities", "--schema", "semanticPose").data;
  expect(schema.$defs["urn:pixelforge:semantic-pose:1.0"].properties.format.const).toBe("pixelforge-semantic-pose");
  const args = [join(dir, "hold.semantic-pose.json"), "--rig", join(dir, "clerk.rig.json"), "--library", join(dir, "clerk.poses.json"), "--object", join(dir, "folder.object.json")];
  expect(cli("doctor", ...args, "--json").data.ok).toBe(true);
  const readonly = cli("rig", "resolve-pose", ...args, "--json"); expect(readonly.status, readonly.stderr).toBe(0); expect(readonly.data.outputs).toEqual([]);
  const temp = mkdtempSync(join(tmpdir(), "pixelforge-semantic-test-"));
  const out = join(temp, "resolved.pose.json"), outRig = join(temp, "resolved.rig.json");
  const run = cli("rig", "resolve-pose", ...args, "--out", out, "--out-rig", outRig, "--json"); expect(run.status, run.stderr).toBe(0);
  expect(cli("rig", "resolve-pose", ...args, "--out", out, "--out-rig", outRig).status).toBe(1);
  expect(cli("rig", "resolve-pose", ...args, "--out", join(dir, "clerk.poses.json"), "--out-rig", outRig, "--force").status).toBe(1);
  const invalid = join(temp, "missing.semantic-pose.json"), badOut = join(temp, "not-written.pose.json");
  writeFileSync(invalid, JSON.stringify({ ...request, attachment: { ...request.attachment, grip: "missing" } }));
  const bad = cli("rig", "resolve-pose", invalid, ...args.slice(1), "--out", badOut, "--json"); expect(bad.status).toBe(1); expect(existsSync(badOut)).toBe(false);
  const png = join(temp, "resolved.png"), sprite = join(temp, "resolved.sprite.json"), preview = join(temp, "preview.png");
  const render = cli("rig", "render", outRig, "--pose", out, "--output", png, "--sprite", sprite); expect(render.status, render.stderr).toBe(0);
  expect(cli("preview", sprite, "--out", preview, "--json").status).toBe(0);
  for (const f of sourceFiles) expect(readFileSync(join(dir, f), "utf8")).toBe(original[f]);
  expect(JSON.stringify({ rig, library, object, request })).toBe(snapshot);
  if (process.env.PIXELFORGE_PRESERVATION_BASELINE) {
    const hashes = JSON.parse(readFileSync(process.env.PIXELFORGE_PRESERVATION_BASELINE, "utf8"));
    for (const [file, hash] of Object.entries(hashes)) expect(createHash("sha256").update(readFileSync(file)).digest("hex"), file).toBe(hash);
  }
  console.log(JSON.stringify({ out, outRig, png, sprite, preview }));
});
