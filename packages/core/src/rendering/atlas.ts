import { toDocument, type Project } from "../models/project.js";
import { renderFrame } from "./render.js";
export interface AtlasOptions {
  padding?: number;
  maxWidth?: number;
  maxHeight?: number;
  powerOfTwo?: boolean;
  image?: string;
}
/** Stable untrimmed shelf packing in source-frame order. No rotation or duplicate textures. */
export function renderAtlas(p: Project, options: AtlasOptions = {}) {
  toDocument(p);
  const padding = options.padding ?? 1,
    maxWidth = options.maxWidth ?? 2048,
    maxHeight = options.maxHeight ?? 2048;
  if (!Number.isInteger(padding) || padding < 0 || padding > 1024)
    throw new Error("Atlas padding must be 0–1024");
  for (const [name, n] of [
    ["width", maxWidth],
    ["height", maxHeight],
  ] as const)
    if (!Number.isInteger(n) || n < 1 || n > 8192)
      throw new Error(`Maximum atlas ${name} must be 1–8192`);
  const pow = (n: number) => 2 ** Math.ceil(Math.log2(n));
  const usableWidth = options.powerOfTwo
    ? 2 ** Math.floor(Math.log2(maxWidth))
    : maxWidth;
  const columns = Math.floor((usableWidth + padding) / (p.width + padding));
  if (columns < 1) throw new Error("Frame cannot fit maximum atlas width");
  const count = Math.min(columns, p.frames.length),
    rows = Math.ceil(p.frames.length / count);
  let width = count * p.width + (count - 1) * padding,
    height = rows * p.height + (rows - 1) * padding;
  if (options.powerOfTwo) {
    width = pow(width);
    height = pow(height);
  }
  if (width > maxWidth || height > maxHeight)
    throw new Error("Frames cannot fit maximum atlas dimensions");
  if (width * height > 64 * 1024 * 1024)
    throw new Error("Atlas exceeds 64 megapixel budget");
  const data = new Uint8Array(width * height * 4);
  const records = p.frames.map((frame, index) => {
    const x = (index % count) * (p.width + padding),
      y = Math.floor(index / count) * (p.height + padding),
      r = renderFrame(p, frame.id);
    for (let row = 0; row < p.height; row++)
      data.set(
        r.data.subarray(row * p.width * 4, (row + 1) * p.width * 4),
        ((y + row) * width + x) * 4,
      );
    return [
      frame.id,
      {
        frame: { x, y, w: p.width, h: p.height },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: p.width, h: p.height },
        sourceSize: { w: p.width, h: p.height },
      },
    ] as const;
  });
  const atlas = {
    frames: Object.fromEntries(records),
    meta: {
      app: "PixelForge",
      version: "1.0",
      image: options.image ?? "texture.png",
      format: "RGBA8888",
      size: { w: width, h: height },
      scale: "1",
    },
  };
  return {
    raster: { width, height, data },
    atlas,
    unusedArea: width * height - p.frames.length * p.width * p.height,
  };
}
