import { renderFrame, type Project } from "@pixelforge/core";
import { encodePNG } from "./index.js";

export const PREVIEW_LIMITS = { maxPixels: 16_777_216, maxDimension: 16384, maxScale: 16 };
export async function exportPreview(p: Project, frameId: string, options: {
  scale?: number; background?: string; grid?: boolean;
} = {}) {
  const scale = options.scale ?? 4;
  if (!Number.isInteger(scale) || scale < 1 || scale > PREVIEW_LIMITS.maxScale)
    throw new Error("Preview scale must be an integer 1..16");
  if (options.background && !["transparent", "checkerboard"].includes(options.background))
    throw new Error("Background must be transparent or checkerboard");
  const width = p.width * scale, height = p.height * scale;
  if (width * height > PREVIEW_LIMITS.maxPixels || Math.max(width, height) > PREVIEW_LIMITS.maxDimension)
    throw new Error("Preview exceeds 16MP or 16384px; reduce scale");
  const frame = renderFrame(p, frameId), data = new Uint8Array(width * height * 4);
  let opaque = 0;
  for (let i = 3; i < frame.data.length; i += 4) if (frame.data[i]) opaque++;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const src = (Math.floor(y / scale) * p.width + Math.floor(x / scale)) * 4;
    const at = (y * width + x) * 4, alpha = frame.data[src + 3]! / 255;
    data.set(frame.data.subarray(src, src + 4), at);
    if (options.background === "checkerboard") {
      const value = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 192 : 224;
      for (let c = 0; c < 3; c++) data[at + c] = Math.round(frame.data[src + c]! * alpha + value * (1 - alpha));
      data[at + 3] = 255;
    }
    if (options.grid && scale > 1 && (x % scale === 0 || y % scale === 0)) {
      data.set([96, 96, 96, 255], at);
    }
  }
  return { png: await encodePNG({ width, height, data }), width, height,
    warnings: opaque ? [] : [{ code: "PF_FRAME_TRANSPARENT", severity: "warning", frameId, message: "Selected frame is fully transparent." }] };
}
