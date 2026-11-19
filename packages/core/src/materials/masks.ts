import { projectSchema, type ProjectDocument } from "../schema/project.js";
import { surfaceMaskSchema, surfaceRegionsSchema, type SurfaceEntry, type SurfaceMask } from "./schema.js";
export interface MaterialDiagnostic { code: string; severity: "error" | "warning"; path: string; message: string; suggestion: string }
export const materialError = (code: string, path: string, message: string, suggestion: string, severity: "error" | "warning" = "error"): MaterialDiagnostic => ({ code, severity, path, message, suggestion });
/** Portable layout identifier, not a cryptographic signature. RGBA values/metadata are deliberately excluded. */
export function surfaceFingerprint(sprite: ProjectDocument): string {
  const text = JSON.stringify([sprite.width, sprite.height, sprite.layers, sprite.frames]);
  let a = 2166136261, b = 2246822507;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 3266489909); }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
export function encodeSurfaceRuns(pixels: Iterable<number>, width: number): SurfaceEntry["runs"] {
  const sorted = [...new Set(pixels)].sort((a, b) => a - b), runs: SurfaceEntry["runs"] = [];
  for (const p of sorted) {
    const x = p % width, y = Math.floor(p / width), last = runs.at(-1);
    if (last && last.y === y && last.x + last.length === x) last.length++;
    else runs.push({ x, y, length: 1 });
  }
  return runs;
}
export function createSurfaceMask(sprite: ProjectDocument, id: string, surfaces: SurfaceEntry[]): SurfaceMask {
  return surfaceMaskSchema.parse({ format: "pixelforge-surface-mask", version: "1.0", id,
    source: { width: sprite.width, height: sprite.height, fingerprint: surfaceFingerprint(sprite) }, surfaces });
}
export function validateSurfaceMask(input: unknown, spriteInput?: unknown, selection?: string[]) {
  const diagnostics: MaterialDiagnostic[] = [], parsed = surfaceMaskSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) diagnostics.push(materialError("PF_MATERIAL_MASK_INVALID", `$.${issue.path.join(".")}`, issue.message, "Use capabilities --schema surfaceMask; generate a mask from parts or explicit regions."));
    return { ok: false, diagnostics };
  }
  const mask = parsed.data;
  if (new Set(mask.surfaces.map(s => s.id)).size !== mask.surfaces.length) diagnostics.push(materialError("PF_MATERIAL_MASK_INVALID", "$.surfaces", "Surface IDs must be unique.", "Give each owned surface a unique ID."));
  const selected = selection ?? mask.surfaces.map(s => s.id);
  if (!selected.length || new Set(selected).size !== selected.length || selected.some(id => !mask.surfaces.some(s => s.id === id)))
    diagnostics.push(materialError("PF_MATERIAL_SURFACE_MISSING", "$.surfaces", "Selected surfaces are empty, duplicate or absent from this mask.", "Select existing unique surface IDs from the mask."));
  const parsedSprite = spriteInput === undefined ? undefined : projectSchema.safeParse(spriteInput);
  const sprite = parsedSprite?.success ? parsedSprite.data : undefined;
  if (parsedSprite && !parsedSprite.success) diagnostics.push(materialError("PF_MATERIAL_SOURCE_INVALID", "$", "Source sprite is invalid.", "Run doctor on the sprite and supply an ordinary sprite 1.0 document."));
  if (sprite && (sprite.width !== mask.source.width || sprite.height !== mask.source.height || surfaceFingerprint(sprite) !== mask.source.fingerprint))
    diagnostics.push(materialError("PF_MATERIAL_SOURCE_MISMATCH", "$.source", "Mask dimensions/layout fingerprint differ from the source sprite.", "Use the original untextured source and its mask; regenerate ownership after deliberate layout edits."));
  const occupied = new Map<string, Set<number>>(), targets: { surface: SurfaceEntry; pixels: Set<number> }[] = [];
  let count = 0, protectedWork = 0;
  for (const [si, surface] of mask.surfaces.entries()) {
    const path = `$.surfaces[${si}]`, pixels = new Set<number>(), reserved = new Set<number>();
    const frame = sprite?.frames.find(f => f.id === surface.frame), layer = sprite?.layers.find(l => l.id === surface.layer);
    if (sprite && (!frame || !layer || !layer.visible)) diagnostics.push(materialError("PF_MATERIAL_TARGET_INVALID", path, "Surface frame/layer is missing or hidden.", "Select an existing frame and visible layer."));
    for (const [runs, set, isProtected] of [[surface.runs, pixels, false], [surface.protected, reserved, true]] as const) for (const run of runs) {
      if (run.y >= mask.source.height || run.x + run.length > mask.source.width) { diagnostics.push(materialError("PF_MATERIAL_MASK_BOUNDS", path, "Mask run exceeds the source canvas.", "Correct explicit run/region dimensions; masks are never clipped.")); continue; }
      if (isProtected) protectedWork += run.length; else count += run.length;
      if (count > 100000 || protectedWork > 4_000_000) { diagnostics.push(materialError("PF_MATERIAL_LIMIT", path, "Mask work exceeds bounded limits.", "Use smaller surfaces or split requests; at most 100000 owned and 4 million protected cells.")); return { ok: false, diagnostics }; }
      for (let x = run.x; x < run.x + run.length; x++) {
        const p = run.y * mask.source.width + x;
        if (set.has(p) && !isProtected) diagnostics.push(materialError("PF_MATERIAL_MASK_OVERLAP", path, "Owned runs overlap.", "Declare each owned pixel only once."));
        set.add(p);
      }
    }
    for (const p of pixels) {
      if (reserved.has(p)) { diagnostics.push(materialError("PF_MATERIAL_UNSAFE_SURFACE", path, "Owned pixels intersect protected structure.", "Remove outline, hardware, label and other protected pixels from the owned runs.")); break; }
      if (sprite && frame && layer && sprite.palette[frame.layers[surface.layer]![p]!]![3] !== 255) {
        diagnostics.push(materialError("PF_MATERIAL_UNSAFE_SURFACE", path, "Owned surface contains transparent or translucent pixels.", "Exclude transparency; material colors may only replace opaque owned surface pixels.")); break;
      }
    }
    if (selected.includes(surface.id)) {
      const k = JSON.stringify([surface.frame, surface.layer]), seen = occupied.get(k) ?? new Set<number>();
      if ([...pixels].some(p => seen.has(p))) diagnostics.push(materialError("PF_MATERIAL_MASK_OVERLAP", path, "Selected surfaces overlap on the same plane.", "Use disjoint ownership masks."));
      for (const p of pixels) seen.add(p);
      occupied.set(k, seen); targets.push({ surface, pixels });
    }
  }
  return { ok: !diagnostics.some(d => d.severity === "error"), diagnostics, mask, sprite, targets };
}
/** Adapter for explicitly authored rectangles/reserved structure; no semantic/color inference. */
export function surfaceMaskFromRegions(spriteInput: unknown, input: unknown) {
  const sprite = projectSchema.safeParse(spriteInput), regions = surfaceRegionsSchema.safeParse(input);
  if (!sprite.success || !regions.success) return { ok: false, diagnostics: [materialError("PF_MATERIAL_MASK_INVALID", "$", "Invalid sprite or region declarations.", "Use capabilities --schema surfaceRegions and a valid sprite.")] };
  const surfaces: SurfaceEntry[] = [];
  for (const s of regions.data.surfaces) {
    const owned: number[] = [], reserved: number[] = [];
    for (const [list, output] of [[s.regions, owned], [s.protected, reserved]] as const) for (const r of list) {
      if (r.x + r.width > sprite.data.width || r.y + r.height > sprite.data.height || r.width * r.height > 100000)
        return { ok: false, diagnostics: [materialError("PF_MATERIAL_MASK_BOUNDS", "$", "Region exceeds the source canvas or work limit.", "Declare bounded explicit ownership; regions are not clipped.")] };
      for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) output.push(y * sprite.data.width + x);
      if (owned.length + reserved.length > 100000) return { ok: false, diagnostics: [materialError("PF_MATERIAL_LIMIT", "$", "Region work exceeds 100000 cells.", "Split the mask into smaller authored surfaces.")] };
    }
    const protection = new Set(reserved);
    surfaces.push({ id: s.id, frame: s.frame, layer: s.layer, runs: encodeSurfaceRuns(owned.filter(p => !protection.has(p)), sprite.data.width), protected: encodeSurfaceRuns(reserved, sprite.data.width) });
  }
  const mask = createSurfaceMask(sprite.data, regions.data.id, surfaces), checked = validateSurfaceMask(mask, sprite.data);
  return { ...checked, mask };
}
