import { renderFrame } from "./render.js";
import { toDocument, type Project } from "../models/project.js";
export interface SheetOptions {
  columns?: number;
  padding?: number;
}
export function renderSpriteSheet(p: Project, options: SheetOptions = {}) {
  toDocument(p);
  const columns = options.columns ?? p.frames.length,
    padding = options.padding ?? 0;
  if (!Number.isInteger(columns) || columns < 1 || columns > 4096)
    throw new Error("Columns must be 1–4096");
  if (!Number.isInteger(padding) || padding < 0 || padding > 1024)
    throw new Error("Padding must be 0–1024");
  const rows = Math.ceil(p.frames.length / columns),
    width = columns * p.width + (columns - 1) * padding,
    height = rows * p.height + (rows - 1) * padding;
  if (width * height > 64 * 1024 * 1024)
    throw new Error("Spritesheet exceeds 64 megapixel limit");
  const data = new Uint8Array(width * height * 4);
  const frames = p.frames.map((f, index) => {
    const x = (index % columns) * (p.width + padding),
      y = Math.floor(index / columns) * (p.height + padding),
      r = renderFrame(p, f.id);
    for (let row = 0; row < p.height; row++)
      data.set(
        r.data.subarray(row * p.width * 4, (row + 1) * p.width * 4),
        ((y + row) * width + x) * 4,
      );
    return { id: f.id, index, x, y, width: p.width, height: p.height };
  });
  const indices = new Map(frames.map((f) => [f.id, f.index]));
  const manifest = {
    format: "pixelforge-manifest" as const,
    version: "1.0",
    name: p.name,
    width,
    height,
    frameWidth: p.width,
    frameHeight: p.height,
    columns,
    rows,
    padding,
    margin: 0,
    frames,
    animations: p.animations.map((a) => ({
      name: a.name,
      loop: a.loop,
      frames: a.frames.map((f) => ({
        index: indices.get(f.frameId)!,
        durationMs: f.durationMs,
      })),
    })),
  };
  return { raster: { width, height, data }, manifest };
}
