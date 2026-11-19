import { projectSchema, createSurfaceMask, encodeSurfaceRuns, materialError, validateSurfaceMask, type SurfaceEntry } from "@pixelforge/core";
import { buildProp } from "./props.js";
import { renderRig } from "./raster.js";

/** Explicit geometry ownership through the existing rasterizer; never guesses surfaces from art colors. */
export function propSurfaceMask(spriteInput: unknown, parts: string[]) {
  const parsed = projectSchema.safeParse(spriteInput);
  const fail = (code: string, message: string, suggestion: string) => ({ ok: false, diagnostics: [materialError(code, "$", message, suggestion)] });
  if (!parsed.success) return fail("PF_MATERIAL_SOURCE_INVALID", "Invalid sprite document.", "Supply a generated editable prop sprite.");
  const sprite = parsed.data, provenance = sprite.metadata?.pixelforgeProp;
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance) || !Object.hasOwn(provenance, "source"))
    return fail("PF_MATERIAL_MASK_REQUIRED", "Sprite has no parametric prop source provenance.", "Use --regions with explicit ownership for non-prop sprites, or resolve the original prop first.");
  const built = buildProp(provenance.source);
  if (!built.ok || !built.rig || !built.pose) return fail("PF_MATERIAL_SOURCE_INVALID", "Stored prop source cannot be compiled.", "Resolve a valid original prop before generating surface masks.");
  const rig = built.rig, canonical = renderRig(rig, built.pose).project;
  if (sprite.width !== rig.canvas.width || sprite.height !== rig.canvas.height || sprite.frames.length !== 1 || sprite.frames[0]!.id !== built.pose.id ||
    JSON.stringify(sprite.layers) !== JSON.stringify(canonical.layers) ||
    sprite.layers.some(l => JSON.stringify(sprite.frames[0]!.layers[l.id]) !== JSON.stringify(Array.from(canonical.frames[0]!.layers.get(l.id)!))))
    return fail("PF_MATERIAL_SOURCE_MISMATCH", "Sprite pixel layout differs from its generated prop geometry.", "Generate ownership on the unedited prop variant; use explicit regions/protection for hand-edited sprites. Palette-only changes are allowed.");
  if (!parts.length || new Set(parts).size !== parts.length || parts.some(id => !rig.shapes.some(s => s.id === id)))
    return fail("PF_MATERIAL_SURFACE_MISSING", "Part IDs are empty, duplicate or missing from generated geometry.", "Inspect prop resolve JSON rig.shapes and select existing solid surface IDs.");
  if (parts.some(id => /-(?:handle|label)-/.test(id)))
    return fail("PF_MATERIAL_UNSAFE_SURFACE", "Hardware and label parts are protected, not material surfaces.", "Select top, body, drawer, leg, frame or pane surfaces; hardware/labels remain unchanged.");
  const area = sprite.width * sprite.height, owner = new Int16Array(area).fill(-1), interior = new Uint8Array(area);
  // Render order exactly matches renderRig: layers, then declared shapes. Unique markers encode ownership, not art palette inference.
  for (const layer of rig.layers) for (const [i, shape] of rig.shapes.entries()) if (shape.layer === layer) {
    const marker = renderRig({ ...rig, palette: [[0, 0, 0, 0], [255, 255, 255, 255], [0, 0, 0, 255]],
      shapes: [{ ...shape, color: 1, outline: shape.outline ? 2 : 0 }] }, built.pose).project.frames[0]!.layers.get(layer)!;
    for (let p = 0; p < area; p++) if (marker[p]) { owner[p] = i; interior[p] = marker[p] === 1 ? 1 : 0; }
  }
  const surfaces: SurfaceEntry[] = parts.map(id => {
    const i = rig.shapes.findIndex(s => s.id === id), owned: number[] = [], protectedPixels: number[] = [];
    for (let p = 0; p < area; p++) { if (owner[p] === i && interior[p]) owned.push(p); else protectedPixels.push(p); }
    return { id, frame: built.pose!.id, layer: rig.shapes[i]!.layer, runs: encodeSurfaceRuns(owned, sprite.width), protected: encodeSurfaceRuns(protectedPixels, sprite.width) };
  });
  const mask = createSurfaceMask(sprite, `${rig.id}-surfaces`, surfaces), result = validateSurfaceMask(mask, sprite);
  return { ...result, mask, ownership: "Existing geometry shape IDs, interior fill and final visible owner; borders and occluded hardware/labels excluded." };
}
