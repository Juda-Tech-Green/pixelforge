import { renderSpriteSheet, type SheetOptions } from "@pixelforge/core";
export { exportPhaserBundle } from "./bundle.js";
export { renderSpriteSheet, type SheetOptions } from "@pixelforge/core";
import sharp from "sharp";
import {
  renderFrame,
  toDocument,
  type Project,
  type Raster,
} from "@pixelforge/core";
export async function encodePNG(raster: Raster): Promise<Buffer> {
  return sharp(raster.data, {
    raw: { width: raster.width, height: raster.height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}
export async function exportFramePNG(
  project: Project,
  frameId: string,
): Promise<Buffer> {
  toDocument(project);
  return encodePNG(renderFrame(project, frameId));
}
export async function exportSpriteSheet(
  p: Project,
  options: SheetOptions = {},
) {
  const { raster, manifest } = renderSpriteSheet(p, options);
  return { png: await encodePNG(raster), manifest };
}
