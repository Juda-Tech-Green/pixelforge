import { assertNoGameReference } from "../models/game-associations.js";
import { getAnimation, type Project, type Layer } from "../models/project.js";
import { colorSchema, type Color } from "../schema/project.js";

export function getLayer(p: Project, id: string): Layer {
  const layer = p.layers.find((l) => l.id === id);
  if (!layer) throw new Error(`Unknown layer: ${id}`);
  return layer;
}
export function renameLayer(p: Project, id: string, name: string): void {
  if (!name.length || name.length > 128)
    throw new Error("Layer name must contain 1–128 characters");
  getLayer(p, id).name = name;
}
export function setLayerVisibility(
  p: Project,
  id: string,
  visible: boolean,
): void {
  if (typeof visible !== "boolean")
    throw new Error("Visibility must be boolean");
  getLayer(p, id).visible = visible;
}
export function removeLayer(p: Project, id: string): void {
  getLayer(p, id);
  if (p.layers.length === 1) throw new Error("Cannot delete the last layer");
  p.layers = p.layers.filter((l) => l.id !== id);
  for (const frame of p.frames) frame.layers.delete(id);
}
export function reorderLayers(p: Project, ids: string[]): void {
  if (ids.length !== p.layers.length || new Set(ids).size !== ids.length)
    throw new Error("Provide every layer ID exactly once");
  const layers = ids.map((id) => getLayer(p, id));
  p.layers = layers;
}
export function removeAnimation(p: Project, name: string): void {
  getAnimation(p, name);
  assertNoGameReference(p, "animation", name);
  p.animations = p.animations.filter((a) => a.name !== name);
}
export function setAnimationLoop(
  p: Project,
  name: string,
  loop: boolean,
): void {
  if (typeof loop !== "boolean") throw new Error("Loop must be boolean");
  getAnimation(p, name).loop = loop;
}
export function addPaletteColor(p: Project, color: Color): number {
  const parsed = colorSchema.parse(color);
  if (p.palette.length >= 256)
    throw new Error("Palette is limited to 256 colors");
  p.palette.push(parsed);
  return p.palette.length - 1;
}
function checkColor(p: Project, index: number): void {
  if (!Number.isInteger(index) || index <= 0 || index >= p.palette.length)
    throw new Error(
      "Select an existing nonzero palette index; index 0 is reserved",
    );
}
export function updatePaletteColor(
  p: Project,
  index: number,
  color: Color,
): void {
  checkColor(p, index);
  p.palette[index] = colorSchema.parse(color);
}
export function removePaletteColor(p: Project, index: number): void {
  checkColor(p, index);
  for (const frame of p.frames)
    for (const pixels of frame.layers.values()) {
      if (pixels.includes(index))
        throw new Error(
          `Palette index ${index} is still used by frame ${frame.id}`,
        );
    }
  // Validate usage before mutation. Remap higher indices to preserve their RGBA colors.
  p.palette.splice(index, 1);
  for (const frame of p.frames)
    for (const pixels of frame.layers.values()) {
      for (let i = 0; i < pixels.length; i++)
        if (pixels[i]! > index) pixels[i]!--;
    }
}
