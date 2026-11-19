import { test, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, linkSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { z } from "zod";
import ts from "typescript";
import { createProp, buildProp, resolveProp, parametricPropSchema, rigSchema, poseSchema, resolveSemanticPose, type ParametricProp } from "@pixelforge/geometry";
import { projectSchema, fromDocument, toDocument, applyOperations, renderFrame, resolveSemanticExpression } from "@pixelforge/core";

const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const directory = resolve("examples/parametric-props"), names = ["clerk-desk", "executive-desk", "filing-cabinet", "office-window"];
const sources: ParametricProp[] = names.map(n => read(join(directory, `${n}.prop.json`)));
const snapshot = JSON.stringify(sources);
const digest = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
function cli(...args: string[]) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--conditions=development", "packages/cli/src/index.ts", ...args], { encoding: "utf8" });
  return { ...result, data: result.stdout.trim() ? JSON.parse(result.stdout) : undefined };
}

test("versioned prop schema, defaults and all families resolve deterministically with scoped TypeScript checks", () => {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile), parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const roots = ["packages/geometry/src/prop-schema.ts", "packages/geometry/src/props.ts", "packages/geometry/src/index.ts", "packages/cli/src/props.ts", "packages/cli/src/agents.ts", "packages/cli/src/index.ts", "scripts/schemas.ts", "tests/parametric-props.test.ts", "tests/semantic-expression.test.ts"].map(f => resolve(f).replaceAll("\\", "/"));
  const program = ts.createProgram(roots, { ...parsed.options, noEmit: true });
  const errors = ts.getPreEmitDiagnostics(program).filter(d => d.file && roots.some(f => f.toLowerCase() === d.file!.fileName.replaceAll("\\", "/").toLowerCase()));
  expect(errors.map(d => `${d.file!.fileName}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`)).toEqual([]);
  expect(read("schemas/prop.schema.json")).toEqual(z.toJSONSchema(parametricPropSchema));
  for (const type of ["desk", "cabinet", "window"] as const) expect(buildProp(createProp(type, `my-${type}`)).ok).toBe(true);
  for (const source of sources) {
    const a = resolveProp(source);
    expect(a.ok, JSON.stringify(a.diagnostics)).toBe(true); expect(a).toEqual(resolveProp(source));
    expect(a.diagnostics).toEqual([]); expect(rigSchema.safeParse(a.rig).success).toBe(true);
    expect(poseSchema.safeParse(a.pose).success).toBe(true); expect(projectSchema.safeParse(a.sprite).success).toBe(true);
    expect(a.sprite!.version).toBe("1.0"); expect(a.sprite!.metadata!.pixelforgeProp).toEqual({ version: "1.0", source: a.source, anchors: a.anchors });
  }
});

test("desk dimensions preserve pedestals, drawers, legs, transparent knee opening and integer borders", () => {
  const small = resolveProp(sources[0]), large = resolveProp(sources[1]);
  expect(small.ok && large.ok).toBe(true);
  expect(small.rig!.canvas).toEqual({ width: 55, height: 37 }); expect(large.rig!.canvas).toEqual({ width: 80, height: 48 });
  expect(small.rig!.shapes.filter(s => s.id.includes("-drawer-")).length).toBe(2);
  expect(large.rig!.shapes.filter(s => s.id.includes("-drawer-")).length).toBe(6);
  for (const result of [small, large]) {
    expect(result.rig!.shapes.filter(s => s.id.startsWith("desk-leg-")).length).toBe(2);
    const component = result.source!.component;
    if (component.type !== "desk") throw new Error("Expected desk");
    const origin = result.rig!.joints[0]!.position, raster = renderFrame(fromDocument(result.sprite), result.pose!.id);
    const alpha = (x: number, y: number) => raster.data[(y * raster.width + x) * 4 + 3];
    expect(alpha(origin[0] + Math.floor(component.width / 2), origin[1] + component.depth + component.topThickness + 2)).toBe(0);
    expect(alpha(origin[0] + component.legInset + 1, origin[1] + component.depth + component.height - 2)).toBe(255);
    for (const shape of result.rig!.shapes) {
      if (shape.type !== "polygon") throw new Error("Expected existing polygon primitive");
      for (const [x, y] of shape.points) {
        expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
        expect(x + origin[0]).toBeGreaterThanOrEqual(0); expect(x + origin[0]).toBeLessThan(result.rig!.canvas.width);
        expect(y + origin[1]).toBeGreaterThanOrEqual(0); expect(y + origin[1]).toBeLessThan(result.rig!.canvas.height);
      }
    }
  }
  const open = createProp("desk", "open-table"); if (open.component.type === "desk") delete open.component.drawers;
  expect(buildProp(open).rig!.shapes.some(s => s.id.includes("drawer"))).toBe(false);
});

test("cabinets and windows retain labels/handles/base and panes/frame/sill across valid sizes", () => {
  const cabinet = resolveProp(sources[2]), window = resolveProp(sources[3]);
  expect(cabinet.rig!.shapes.filter(s => s.id.startsWith("cabinet-label-")).length).toBe(4);
  expect(cabinet.rig!.shapes.filter(s => s.id.startsWith("cabinet-handle-")).length).toBe(4);
  expect(cabinet.rig!.shapes.some(s => s.id === "cabinet-base")).toBe(true);
  expect(window.rig!.shapes.filter(s => s.id.startsWith("window-pane-")).length).toBe(4);
  expect(window.rig!.shapes.some(s => s.id === "window-sill")).toBe(true);
  const resized = createProp("window", "big-window");
  if (resized.component.type !== "window") throw new Error("Expected window");
  Object.assign(resized.component, { width: 64, height: 48, columns: 3, rows: 2, frame: 4 });
  const larger = resolveProp(resized);
  expect(larger.ok).toBe(true); expect(larger.rig!.shapes.filter(s => s.id.startsWith("window-pane-")).length).toBe(6);
  resized.component.sillHeight = 0;
  expect(buildProp(resized).rig!.shapes.some(s => s.id === "window-sill")).toBe(false);
  const tiny = createProp("window", "tiny-window");
  Object.assign(tiny.component, { width: 12, height: 12, columns: 1, rows: 1, frame: 1, sillHeight: 0 });
  expect(resolveProp(tiny).ok).toBe(true);
});

test("palette role changes preserve geometry and ordinary palette operations recolor editable sprites", () => {
  const a = resolveProp(sources[0]), recolored = structuredClone(sources[0]!);
  recolored.palette[2] = [100, 70, 57, 255];
  const b = resolveProp(recolored);
  expect(b.ok).toBe(true); expect(b.rig!.shapes).toEqual(a.rig!.shapes); expect(b.sprite!.frames).toEqual(a.sprite!.frames);
  const updated = toDocument(applyOperations(fromDocument(a.sprite), { version: "1.0", operations: [{ op: "updatePaletteColor", index: 2, color: recolored.palette[2] }] }));
  expect(updated.frames).toEqual(a.sprite!.frames); expect(updated.palette).toEqual(b.sprite!.palette);
  expect(renderFrame(fromDocument(updated), a.pose!.id)).toEqual(renderFrame(fromDocument(b.sprite), b.pose!.id));
  const edited = applyOperations(fromDocument(a.sprite), { version: "1.0", operations: [{ op: "setPixel", frame: a.pose!.id, layer: "details", x: 0, y: 0, color: 5 }] });
  expect(toDocument(edited).frames[0]!.layers.details![0]).toBe(5);
  expect(a.sprite!.frames[0]!.layers.details![0]).toBe(0);
  expect(sources.every(s => JSON.stringify(s.palette) === JSON.stringify(sources[0]!.palette))).toBe(true);
});

test("invalid schemas, structural dimensions, drawer stacks, panes and palette references yield corrective diagnostics", () => {
  const cases: [unknown, string][] = [];
  cases.push([{ ...sources[0], component: { type: "chair", width: 48, height: 28 } }, "PF_PROP_COMPONENT_UNSUPPORTED"]);
  cases.push([{ ...sources[0], component: { ...sources[0]!.component, width: 2.5 } }, "PF_PROP_PARAMETER_INVALID"]);
  cases.push([{ ...sources[0], component: { ...sources[0]!.component, legInset: 16, legWidth: 12 } }, "PF_PROP_STRUCTURE_INVALID"]);
  cases.push([{ ...sources[0], component: { ...sources[0]!.component, drawers: { side: "right", width: 13, count: 6, labels: true } } }, "PF_PROP_DRAWERS_DONT_FIT"]);
  cases.push([{ ...sources[3], component: { ...sources[3]!.component, width: 12, frame: 8 } }, "PF_PROP_PANES_DONT_FIT"]);
  const missing = structuredClone(sources[3]!); delete missing.colors.glass; cases.push([missing, "PF_PROP_COLOR_REQUIRED"]);
  cases.push([{ ...sources[0], colors: { ...sources[0]!.colors, hardware: 255 } }, "PF_PROP_COLOR_INVALID"]);
  const alpha = structuredClone(sources[0]!); alpha.palette[0] = [1, 1, 1, 0]; cases.push([alpha, "PF_PROP_PALETTE_INVALID"]);
  const transparent = structuredClone(sources[0]!); transparent.palette[2]![3] = 0; cases.push([transparent, "PF_PROP_COLOR_INVALID"]);
  for (const [input, code] of cases) {
    const result = resolveProp(input);
    expect(result.ok, JSON.stringify(input)).toBe(false); expect(result.sprite).toBeUndefined(); expect(result.rig).toBeUndefined();
    expect(result.diagnostics.some(d => d.code === code), JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.diagnostics.every(d => d.path.startsWith("$") && d.suggestion.length > 10)).toBe(true);
  }
  const warning = structuredClone(sources[0]!); warning.colors.outline = warning.colors.body;
  expect(buildProp(warning).ok).toBe(true); expect(buildProp(warning).diagnostics[0]!.code).toBe("PF_PROP_LOW_CONTRAST");
});

test("CLI creation, discovery, doctor and resolve are read-only unless requested and protect sources/outputs", () => {
  const out = mkdtempSync(join(tmpdir(), "pixelforge-prop-cli-")), source = join(out, "desk.prop.json");
  const created = cli("prop", "create", "test-desk", "--type", "desk", "--out", source, "--json");
  expect(created.status, created.stderr).toBe(0); const bytes = readFileSync(source, "utf8");
  expect(cli("prop", "create", "test-desk", "--type", "desk", "--out", source).status).toBe(1);
  const caps = cli("capabilities", "--json"); expect(caps.status).toBe(0); expect(caps.data.runtimeVersion).toBe("0.9.0");
  expect(caps.data.parametricProps.types).toEqual(["desk", "cabinet", "window"]);
  expect(cli("capabilities", "--schema", "prop").data).toEqual(z.toJSONSchema(parametricPropSchema));
  expect(cli("doctor", source, "--json").data.ok).toBe(true);
  const plain = cli("prop", "resolve", source, "--json"); expect(plain.status, plain.stderr).toBe(0); expect(plain.data.outputs).toEqual([]);
  const sprite = join(out, "desk.sprite.json"), rig = join(out, "desk.rig.json");
  expect(cli("prop", "resolve", source, "--out", sprite, "--out-rig", rig, "--json").status).toBe(0);
  expect(read(sprite)).toEqual(plain.data.sprite); expect(read(rig)).toEqual(plain.data.rig);
  expect(cli("prop", "resolve", source, "--out", sprite, "--json").status).toBe(1);
  expect(cli("prop", "resolve", source, "--out", source, "--force", "--json").status).toBe(1);
  const alias = join(out, "alias.json"); linkSync(source, alias);
  expect(cli("prop", "resolve", source, "--out", alias, "--force", "--json").status).toBe(1);
  expect(cli("prop", "resolve", source, "--out", sprite, "--out-rig", sprite, "--force", "--json").status).toBe(1);
  const invalid = join(out, "invalid.prop.json"), input = read(source); input.component.drawers.count = 6;
  writeFileSync(invalid, JSON.stringify(input));
  const doctor = cli("doctor", invalid, "--json"), failed = cli("prop", "resolve", invalid, "--json");
  expect(doctor.status).toBe(1); expect(failed.status).toBe(1); expect(doctor.data.diagnostics[0].code).toBe("PF_PROP_DRAWERS_DONT_FIT");
  expect(failed.data.diagnostics[0].code).toBe(doctor.data.diagnostics[0].code);
  writeFileSync(invalid, "{bad-json"); expect(cli("prop", "resolve", invalid, "--json").data.diagnostics[0].code).toBe("PF_PROP_INPUT_INVALID");
  expect(readFileSync(source, "utf8")).toBe(bytes); expect(plain.data.provenance.sha256).toBe(digest(bytes));
}, 60_000);

test("minimal example generates editable outputs, successful doctors and native/nearest-neighbor PNG previews", () => {
  const out = join(mkdtempSync(join(tmpdir(), "pixelforge-props-preview-")), "evaluation");
  const result = spawnSync(process.execPath, ["examples/parametric-props/evaluate.mjs", "--out", out], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  const report = read(join(out, "evaluation.json")); expect(report.results).toHaveLength(4);
  for (const r of report.results) {
    expect(r.resolution.ok && r.doctor.ok && r.spriteDoctor.ok && r.rigDoctor.ok).toBe(true);
    const native = readFileSync(r.native.preview), preview = readFileSync(r.preview.preview);
    expect(native.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(preview.readUInt32BE(16)).toBe(native.readUInt32BE(16) * 4); expect(preview.readUInt32BE(20)).toBe(native.readUInt32BE(20) * 4);
  }
  console.log(JSON.stringify({ evaluation: out, previews: names.map(n => join(out, `${n}.preview.png`)) }));
}, 60_000);

test("existing geometry/sprite/gaze/expression behavior, versions and unrelated files are preserved", () => {
  const baseline = "158deaa97c9da2bbf07434ee6fe0f63154649915", norm = (s: string) => s.replaceAll("\r\n", "\n");
  const files = execFileSync("git", ["ls-tree", "-r", "--name-only", baseline, "packages/core/src", "packages/geometry/src"], { encoding: "utf8" }).trim().split(/\r?\n/);
  for (const f of files) {
    const before = norm(execFileSync("git", ["show", `${baseline}:${f}`], { encoding: "utf8" })), current = norm(readFileSync(f, "utf8"));
    if (f === "packages/geometry/src/index.ts" || f === "packages/core/src/index.ts") expect(current.startsWith(before)).toBe(true); else expect(current, f).toBe(before);
  }
  const legacy = read("tests/fixtures/semantic-gaze-legacy.json"), rig = read("examples/semantic-pose/clerk.rig.json"), context = { library: read("examples/semantic-pose/clerk.poses.json"), objects: [read("examples/semantic-pose/folder.object.json")] };
  for (const c of legacy.cases) expect(digest(JSON.stringify(resolveSemanticPose(rig, c.request, context)))).toBe(c.sha256);
  const expression = resolveSemanticExpression(read("examples/semantic-expression/source.sprite.json"), read("examples/semantic-expression/surprised.expression.json"), read("examples/semantic-expression/face.landmarks.json"));
  expect(expression.ok).toBe(true); expect(expression.operations.operations).toHaveLength(31);
  expect(JSON.stringify(sources)).toBe(snapshot);
  for (const [i, name] of names.entries()) expect(read(join(directory, `${name}.prop.json`))).toEqual(sources[i]);
  const manifests = ["package.json", "package-lock.json", ...["core", "exporters", "cli", "geometry", "phaser", "audio-core", "audio-exporters"].map(n => `packages/${n}/package.json`), "apps/web/package.json", "examples/phaser-playground/package.json"];
  for (const f of manifests) expect(read(f).version).toBe("0.9.0");
  if (process.env.PIXELFORGE_PRESERVATION_BASELINE) for (const [f, hash] of Object.entries(read(process.env.PIXELFORGE_PRESERVATION_BASELINE))) expect(digest(readFileSync(f)), f).toBe(hash);
});
