import { fromDocument, toDocument } from "../models/project.js";
import { applyOperations, type operationsSchema } from "../operations/batch.js";
import { materialSchema, type Material } from "./schema.js";
import { materialError, validateSurfaceMask, type MaterialDiagnostic } from "./masks.js";
import type { z } from "zod";

/** Coordinate hash: seed+integer coordinates+domain; independent of mask traversal and ambient RNG. */
function noise(seed: number, x: number, y: number, domain: number): number {
  let h = seed ^ Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca77) ^ Math.imul(domain, 0xc2b2ae3d);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mod = (n: number, d: number) => ((n % d) + d) % d;
export function materialSchemaDiagnostics(input: unknown): MaterialDiagnostic[] {
  const result = materialSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map(issue => materialError(
    issue.path.includes("type") ? "PF_MATERIAL_TYPE_UNSUPPORTED" : issue.path.includes("density") ? "PF_MATERIAL_DENSITY_INVALID" : issue.path.includes("palette") ? "PF_MATERIAL_PALETTE_INVALID" : "PF_MATERIAL_SETTINGS_INVALID",
    `$.${issue.path.join(".")}`, issue.message, "Use capabilities --schema material; reduce density or correct bounded integer/palette settings."));
}
export function materialSettingsDiagnostics(input: unknown): MaterialDiagnostic[] {
  const diagnostics = materialSchemaDiagnostics(input), parsed = materialSchema.safeParse(input);
  if (!parsed.success) return diagnostics;
  const m = parsed.data;
  if (m.type === "brick") {
    if (m.palette.mortar === undefined) diagnostics.push(materialError("PF_MATERIAL_PALETTE_REQUIRED", "$.palette.mortar", "Brick requires a mortar palette role.", "Choose an existing opaque mortar color distinct from the brick base."));
    if (m.parameters.mortarWidth >= Math.min(m.parameters.brickWidth, m.parameters.brickHeight))
      diagnostics.push(materialError("PF_MATERIAL_BRICK_SPACING", "$.parameters", "Mortar is as thick as a brick dimension.", "Reduce mortarWidth or increase brick width/height; dimensions describe the brick excluding mortar."));
  }
  return diagnostics;
}
function colorAt(m: Material, x: number, y: number): number {
  const roles = m.palette, s = m.seed, intensity = m.intensity;
  x -= m.origin[0]; y -= m.origin[1];
  if (m.type === "wood") {
    const p = m.parameters, u = p.direction === "horizontal" ? x : y, v = p.direction === "horizontal" ? y : x;
    const spacing = p.scale * 3, row = Math.floor(v / spacing), segment = Math.floor(u / (p.scale * 7));
    const onGrain = mod(v, spacing) === Math.floor(noise(s, row, 0, 1) * spacing);
    if (onGrain && noise(s, segment, row, 2) < p.density * intensity * 2.5 && noise(s, segment, row, 3) > .1)
      return noise(s, row, 0, 4) < p.variation ? roles.highlight : roles.shadow;
    if (noise(s, Math.floor(u / (p.scale * 2)), v, 5) < p.wear * intensity * .2) return roles.highlight;
    return roles.base;
  }
  if (m.type === "metal") {
    const p = m.parameters, u = p.direction === "horizontal" ? x : y, v = p.direction === "horizontal" ? y : x;
    const row = Math.floor(v / (4 * p.scale)), segment = Math.floor(u / (6 * p.scale));
    if (mod(v, 4 * p.scale) === Math.floor(noise(s, row, 0, 10) * 4 * p.scale) && noise(s, segment, row, 11) < p.density * intensity * 4)
      return noise(s, segment, row, 12) < .25 ? roles.highlight : roles.shadow;
    if (noise(s, Math.floor(u / 3), v, 13) < p.scratches * intensity * .35 || noise(s, Math.floor(u / 2), Math.floor(v / 2), 14) < p.wear * intensity * .15) return roles.highlight;
    return roles.base;
  }
  if (m.type === "plaster") {
    const p = m.parameters, size = p.patchSize, cx = Math.floor(x / size), cy = Math.floor(y / size), fx = mod(x, size), fy = mod(y, size);
    // Interpolate scalar noise only. Output stays discrete palette indices; no raster/color filtering.
    const value = (noise(s, cx, cy, 20) * (size - fx) * (size - fy) + noise(s, cx + 1, cy, 20) * fx * (size - fy) +
      noise(s, cx, cy + 1, 20) * (size - fx) * fy + noise(s, cx + 1, cy + 1, 20) * fx * fy) / (size * size);
    const threshold = p.density * intensity * .5;
    if (value < threshold) return roles.shadow;
    if (value > 1 - threshold) return roles.highlight;
    if (noise(s, Math.floor(x / 2), Math.floor(y / 2), 21) < p.variation * p.density * intensity * .15) return roles.shadow;
    return roles.base;
  }
  if (m.type === "brick") {
    const p = m.parameters, w = p.brickWidth + p.mortarWidth, h = p.brickHeight + p.mortarWidth, row = Math.floor(y / h);
    const shiftedX = x + (p.stagger && mod(row, 2) ? Math.floor(w / 2) : 0), col = Math.floor(shiftedX / w);
    if (mod(y, h) < p.mortarWidth || mod(shiftedX, w) < p.mortarWidth) return roles.mortar!;
    const shade = noise(s, col, row, 30);
    if (shade < p.variation * intensity * .5) return roles.shadow;
    if (shade > 1 - p.variation * intensity * .5) return roles.highlight;
    return roles.base;
  }
  // Ordered 4x4 brush: seed changes phase, not random speckle. Coverage is bounded at 50%.
  const d = m.parameters, bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bx = mod(Math.floor(x / d.scale) + (s & 3), 4), by = mod(Math.floor(y / d.scale) + ((s >>> 2) & 3), 4);
  return bayer[by * 4 + bx]! < d.density * intensity * 16 ? roles.shadow : roles.base;
}

/** Plan existing setPixel operations and apply them transactionally to a clone of the source. */
export function applyMaterial(spriteInput: unknown, input: unknown, maskInput: unknown, surfaces?: string[]) {
  const diagnostics = materialSettingsDiagnostics(input), parsed = materialSchema.safeParse(input);
  const operations: z.infer<typeof operationsSchema> = { version: "1.0", operations: [] };
  if (spriteInput === undefined) diagnostics.push(materialError("PF_MATERIAL_SOURCE_INVALID", "$", "Material application requires a source sprite.", "Supply a valid existing sprite document."));
  if (maskInput === undefined) diagnostics.push(materialError("PF_MATERIAL_MASK_REQUIRED", "$", "Material application requires an explicit ownership mask.", "Generate a mask from prop parts or authored regions; pass --mask FILE and --surfaces IDS."));
  const checked = maskInput === undefined ? undefined : validateSurfaceMask(maskInput, spriteInput, surfaces);
  if (checked) diagnostics.push(...checked.diagnostics);
  if (!parsed.success || !checked?.ok || !checked.sprite || !checked.targets || !checked.mask || diagnostics.some(d => d.severity === "error"))
    return { ok: false, diagnostics, operations };
  const m = parsed.data, sprite = checked.sprite;
  checked.targets.sort((a, b) => a.surface.id < b.surface.id ? -1 : a.surface.id > b.surface.id ? 1 : 0);
  for (const [role, c] of Object.entries(m.palette)) if (c !== undefined && (c >= sprite.palette.length || sprite.palette[c]![3] !== 255))
    diagnostics.push(materialError("PF_MATERIAL_PALETTE_INVALID", `$.palette.${role}`, "Material role references a missing or non-opaque palette index.", "Use an existing fully opaque palette entry; index zero remains transparent."));
  if (new Set(Object.values(m.palette)).size !== Object.values(m.palette).length)
    diagnostics.push(materialError("PF_MATERIAL_LOW_CONTRAST", "$.palette", "Material roles reuse an index; detail may disappear.", "Choose subtle but distinct palette colors and inspect at native size.", "warning"));
  if (diagnostics.some(d => d.severity === "error")) return { ok: false, diagnostics, operations };
  for (const { surface, pixels } of checked.targets) {
    let minX = sprite.width, minY = sprite.height, maxX = -1, maxY = -1;
    for (const p of pixels) { const x = p % sprite.width, y = Math.floor(p / sprite.width); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const width = Math.max(0, maxX - minX + 1), height = Math.max(0, maxY - minY + 1);
    const tooSmall = pixels.size < 8 || Math.min(width, height) < 2 || (m.type === "brick" && (width < m.parameters.brickWidth + m.parameters.mortarWidth || height < m.parameters.brickHeight + m.parameters.mortarWidth));
    if (tooSmall) {
      diagnostics.push(materialError("PF_MATERIAL_SURFACE_SMALL", `$.surfaces.${surface.id}`, "Surface is too small for readable material detail; it was retained unchanged.", "Use a smaller material scale/brick size or leave this small detail untextured.", "warning")); continue;
    }
    if (!m.intensity) continue;
    const original = sprite.frames.find(f => f.id === surface.frame)!.layers[surface.layer]!;
    for (const p of [...pixels].sort((a, b) => a - b)) {
      const x = p % sprite.width, y = Math.floor(p / sprite.width), color = colorAt(m, x, y);
      if (color !== original[p]) operations.operations.push({ op: "setPixel", frame: surface.frame, layer: surface.layer, x, y, color });
    }
  }
  const variant = toDocument(applyOperations(fromDocument(sprite), operations));
  variant.metadata = { ...variant.metadata, pixelforgeMaterial: JSON.parse(JSON.stringify({ request: m, mask: checked.mask.id, surfaces: checked.targets.map(t => t.surface.id), sourceLayout: checked.mask.source.fingerprint })) };
  return { ok: true, diagnostics, operations, sprite: variant, provenance: variant.metadata.pixelforgeMaterial };
}
