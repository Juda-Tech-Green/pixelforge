import { fromDocument, toDocument } from "../models/project.js";
import { applyOperations, operationsSchema } from "../operations/batch.js";
import { facialLandmarksSchema, semanticExpressionSchema, type FacialLandmarks } from "./schema.js";
import type { z } from "zod";

type Point = [number, number];
export type FaceMatrix = [number, number, number, number, number, number];
export interface ExpressionDiagnostic { code: string; severity: "error" | "warning"; path: string; message: string; suggestion: string }
type Rect = FacialLandmarks["bounds"];
const inside = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;
const contains = (a: Rect, b: Rect) => inside(a, b.x, b.y) && inside(a, b.x + b.width - 1, b.y + b.height - 1);
const key = (x: number, y: number) => `${x},${y}`;
const point = (s: string) => s.split(",").map(Number) as Point;
const map = ([x, y]: Point, m: FaceMatrix): Point => [Math.floor(m[0] * x + m[2] * y + m[4] + .5), Math.floor(m[1] * x + m[3] * y + m[5] + .5)];
// Controls are normalized deltas from the declared neutral artwork, not a face-size assumption.
const presets = {
  neutral: [0, 0, 0, 0, 0], tired: [-1, -.25, 0, -.5, 0], focused: [-.65, -.5, .35, 0, 0],
  worried: [.5, .5, -.6, -.6, 0], surprised: [1, 1, 0, 0, 1], angry: [-.75, -.5, .8, -.5, 0], happy: [-.4, .25, 0, .8, 0],
} as const;

/** Pure opt-in resolver. Existing documents, operations and rendering are untouched. */
export function resolveSemanticExpression(sprite: unknown, input: unknown, landmarks: unknown, matrix?: FaceMatrix) {
  const diagnostics: ExpressionDiagnostic[] = [];
  const batch: z.infer<typeof operationsSchema> = { version: "1.0", operations: [] };
  const add = (code: string, path: string, message: string, suggestion: string, severity: "error" | "warning" = "error") =>
    diagnostics.push({ code, severity, path, message, suggestion });
  const finish = () => ({ ok: !diagnostics.some(d => d.severity === "error"), diagnostics, operations: batch });
  const requestResult = semanticExpressionSchema.safeParse(input), faceResult = facialLandmarksSchema.safeParse(landmarks);
  for (const [result, root] of [[requestResult, "$"], [faceResult, "$.landmarks"]] as const) {
    if (!result.success) for (const issue of result.error.issues) add(
      issue.path.includes("intensity") ? "PF_EXPRESSION_INTENSITY_INVALID" : issue.path.includes("profile") ? "PF_FACE_PROFILE_UNSUPPORTED" : "PF_EXPRESSION_SCHEMA_INVALID",
      `${root}.${issue.path.join(".")}`, issue.message, "Use capabilities --schema semanticExpression / facialLandmarks; correct the declared field.");
  }
  if (!requestResult.success || !faceResult.success) return finish();
  const req = requestResult.data, face = faceResult.data;
  let project;
  try { project = fromDocument(sprite); } catch { add("PF_EXPRESSION_SPRITE_INVALID", "$", "Source is not a valid sprite 1.0 document.", "Run doctor on the source sprite."); return finish(); }
  if (face.layer === face.surfaceLayer || !project.layers.some(l => l.id === face.layer) || !project.layers.some(l => l.id === face.surfaceLayer))
    add("PF_FACE_LAYER_INVALID", "$.landmarks.layer", "Features need separate existing feature and surface layers.", "Separate facial ink from the opaque head surface; declare their layer IDs.");
  else if (!project.layers.find(l => l.id === face.layer)!.visible || !project.layers.find(l => l.id === face.surfaceLayer)!.visible ||
    project.layers.findIndex(l => l.id === face.layer) <= project.layers.findIndex(l => l.id === face.surfaceLayer))
    add("PF_FACE_LAYER_INVALID", "$.landmarks.layer", "Visible facial ink must be above its visible face surface.", "Use visible feature/surface layers in the correct compositing order.");
  const required = face.profile === "front" ? ["leftEye", "rightEye"] : [face.profile === "left-visible" ? "leftEye" : "rightEye"];
  for (const name of required) if (!face.features[name as keyof typeof face.features])
    add("PF_FACE_EYE_MISSING", `$.landmarks.features.${name}`, "Required visible eye landmark is missing.", "Declare the visible eye; use a single-visible-eye profile for a three-quarter face.");
  if (face.profile !== "front" && face.features[face.profile === "left-visible" ? "rightEye" : "leftEye"])
    add("PF_FACE_PROFILE_UNSUPPORTED", "$.landmarks.profile", "Single-eye profile declares the hidden eye.", "Choose front or remove the hidden eye mapping.");
  const features = Object.entries(face.features).filter((entry): entry is [string, NonNullable<typeof entry[1]>] => Boolean(entry[1]));
  const occupied = new Set<string>();
  for (const [name, f] of features) {
    if (!contains(face.bounds, f.region) || !contains(f.region, f.box)) add("PF_FACE_BOUNDS_EXCEEDED", `$.landmarks.features.${name}`, "Neutral box/region exceeds its declared enclosing bounds.", "Place each box inside its region, and each region inside face bounds.");
    for (let y = f.region.y; y < f.region.y + f.region.height; y++) for (let x = f.region.x; x < f.region.x + f.region.width; x++) {
      if (occupied.has(key(x, y))) { add("PF_FACE_REGION_OVERLAP", "$.landmarks.features", "Feature regions overlap.", "Declare disjoint, exclusively owned editable regions."); break; }
      occupied.add(key(x, y));
    }
  }
  if (new Set(req.targets.map(t => t.frame)).size !== req.targets.length) add("PF_EXPRESSION_FRAME_INVALID", "$.targets", "Duplicate target frames.", "List each existing frame once.");
  if (matrix && (matrix.some(v => !Number.isFinite(v)) || Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]) < .99 ||
    Math.abs(Math.hypot(matrix[0], matrix[1]) - 1) > 1e-6 || Math.abs(Math.hypot(matrix[2], matrix[3]) - 1) > 1e-6 || Math.abs(matrix[0] * matrix[2] + matrix[1] * matrix[3]) > 1e-6))
    add("PF_FACE_TRANSFORM_INVALID", "$.targets", "Expected a finite rigid FK transform.", "Use the existing head FK matrix without scale or shear.");
  if (diagnostics.some(d => d.severity === "error")) return finish();
  const p = presets[req.expression.type], s = req.expression.intensity, o = req.expression.overrides;
  const controls = [o?.eyeOpen ?? p[0] * s, o?.browLift ?? p[1] * s, o?.browTilt ?? p[2] * s, o?.mouthCurve ?? p[3] * s, o?.mouthOpen ?? p[4] * s];
  const [eye, lift, tilt, curve, open] = controls as [number, number, number, number, number];
  const unchanged = controls.every(c => c === 0);
  for (const [ti, target] of req.targets.entries()) {
    const frame = project.frames.find(f => f.id === target.frame), path = `$.targets.${ti}`;
    if (!frame) { add("PF_EXPRESSION_FRAME_INVALID", path, `Unknown frame ${target.frame}.`, "Select an existing source frame ID; no frames are created."); continue; }
    if (matrix ? target.origin !== undefined || target.mirror !== undefined : !target.origin) {
      add("PF_FACE_CONTEXT_REQUIRED", path, "Choose either explicit face origin/mirror or rig/pose FK context.", "Declare target.origin, or omit origin/mirror and supply --rig/--pose."); continue;
    }
    const m: FaceMatrix = matrix ?? [target.mirror ? -1 : 1, 0, 0, 1, ...target.origin!];
    const ink = frame.layers.get(face.layer)!, surface = frame.layers.get(face.surfaceLayer)!;
    const canvas = ([x, y]: Point) => x >= 0 && y >= 0 && x < project.width && y < project.height;
    const alpha = (pixels: Uint8Array, xy: Point) => canvas(xy) ? project.palette[pixels[xy[1] * project.width + xy[0]]!]![3] : 0;
    const groups: { name: string; original: Map<string, number>; resolved: Map<string, number>; region: Set<string> }[] = [];
    for (const [name, f] of features) {
      const original = new Map<string, number>(), local = new Map<string, number>(), region = new Set<string>();
      let invalid = false;
      for (let y = f.region.y; y < f.region.y + f.region.height; y++) for (let x = f.region.x; x < f.region.x + f.region.width; x++) {
        const xy = map([x, y], m), k = key(...xy);
        if (!canvas(xy)) { invalid = true; continue; }
        region.add(k);
        const color = ink[xy[1] * project.width + xy[0]]!;
        if (color) {
          original.set(k, color);
          if (inside(f.box, x, y)) local.set(key(x, y), color);
          else invalid = true;
        }
      }
      if (invalid) { add("PF_FACE_BOUNDS_EXCEEDED", path, `${name}: region leaves the canvas or contains ink outside the neutral box.`, "Provide a neutral source with exclusively owned feature regions that fit the canvas."); continue; }
      if (!local.size) { add("PF_FACE_FEATURE_MISSING", path, `${name}: no existing neutral feature pixels at the declared box.`, "Correct the explicit local landmark mapping; the resolver never invents missing artwork."); continue; }
      const resolved = new Map<string, number>();
      const cx = f.box.x + (f.box.width - 1) / 2, cy = f.box.y + (f.box.height - 1) / 2, move = face.maxMove;
      const put = (x: number, y: number, color: number, sourceX: number, sourceY: number) => {
        x = Math.floor(x + .5); y = Math.floor(y + .5);
        const xy = map([x, y], m);
        if (Math.max(Math.abs(x - sourceX), Math.abs(y - sourceY)) > move || !inside(f.region, x, y) || !inside(face.bounds, x, y) || !canvas(xy) || alpha(surface, xy) !== 255) invalid = true;
        else resolved.set(key(...xy), color);
      };
      if (unchanged) original.forEach((v, k) => resolved.set(k, v));
      else if (name.endsWith("Eye")) {
        const height = Math.max(1, f.box.height + Math.round(eye * move));
        const y0 = Math.round(cy - (height - 1) / 2);
        for (let y = 0; y < height; y++) for (let x = f.box.x; x < f.box.x + f.box.width; x++) {
          const sy = f.box.y + Math.min(f.box.height - 1, Math.floor(y * f.box.height / height));
          const color = local.get(key(x, sy)); if (color) put(x, y0 + y, color, x, sy);
        }
      } else for (const [k, color] of local) {
        const [x, y] = point(k), t = f.box.width === 1 ? 0 : (x - cx) / ((f.box.width - 1) / 2);
        if (name.endsWith("Brow")) put(x, y - Math.round(lift * move) + Math.round(t * tilt * move * (name === "leftBrow" ? 1 : -1)), color, x, y);
        else {
          // Existing mouth pixels become two bounded arcs when opened; no new palette/artwork.
          const bend = Math.round(curve * move * (1 - t * t)), gap = Math.round(open * move * Math.sqrt(Math.max(0, 1 - t * t)));
          put(x, y + bend - gap, color, x, y); if (gap) put(x, y + bend + gap, color, x, y);
        }
      }
      if (invalid) {
        add("PF_FACE_MOVEMENT_EXCEEDED", path, `${name}: requested pixels exceed the owned region or opaque face surface; feature retained.`, "Reduce intensity/overrides or deliberately enlarge the safe region/surface.", "warning");
        resolved.clear(); original.forEach((v, k) => resolved.set(k, v));
      }
      if (!unchanged && resolved.size === original.size && [...resolved].every(([k, v]) => original.get(k) === v))
        add("PF_EXPRESSION_QUANTIZED", path, `${name}: no representable pixel change at this size/intensity.`, "Review the preview; use a larger authored feature or a stronger safe intensity if needed.", "warning");
      groups.push({ name, original, resolved, region });
    }
    let separated = true;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      // Small bounded masks only; separation is measured in canvas pixels after FK raster rounding.
      for (const a of groups[i]!.resolved.keys()) {
        const [ax, ay] = point(a);
        for (let dy = -face.minSeparation; dy <= face.minSeparation; dy++) for (let dx = -face.minSeparation; dx <= face.minSeparation; dx++)
          if (groups[j]!.resolved.has(key(ax + dx, ay + dy))) separated = false;
      }
    }
    if (!separated) { add("PF_FACE_SEPARATION", path, "Features violate declared minimum separation; frame retained.", "Reduce movement or revise the declared safe regions/separation.", "warning"); continue; }
    const canvasOwned = new Set<string>();
    for (const g of groups) for (const k of g.region) {
      if (canvasOwned.has(k)) { invalidOverlap(); break; } canvasOwned.add(k);
    }
    function invalidOverlap() { add("PF_FACE_REGION_OVERLAP", path, "Feature regions overlap after raster rounding.", "Space the landmarks farther apart or choose a less rotated pose."); }
    for (const g of groups) for (const k of g.region) {
      const [x, y] = point(k), color = g.resolved.get(k) ?? 0;
      if (ink[y * project.width + x] !== color) batch.operations.push({ op: "setPixel", frame: frame.id, layer: face.layer, x, y, color });
    }
    if (project.animations.flatMap(a => a.frames).filter(f => f.frameId === frame.id).length > 1)
      add("PF_EXPRESSION_SHARED_FRAME", path, "Selected frame has multiple animation references; every reference will show this expression.", "Duplicate/retarget first if only one entry should change.", "warning");
  }
  if (diagnostics.some(d => d.severity === "error")) { batch.operations = []; return finish(); }
  if (batch.operations.length > 100_000) { batch.operations = []; add("PF_EXPRESSION_LIMIT", "$.targets", "Operation count exceeds the existing batch limit.", "Resolve fewer existing frames per request."); return finish(); }
  const variant = toDocument(applyOperations(project, batch));
  return { ...finish(), sprite: variant, provenance: { request: req.id, landmarks: face.id, source: project.name, frames: req.targets.map(t => t.frame),
    geometry: project.metadata?.pixelforgeGeometry ?? null, transform: matrix ?? null } };
}
