import { getAnimation, getFrame, type Project } from "../models/project.js";
export interface Raster {
  width: number;
  height: number;
  data: Uint8Array;
}
export function renderFrame(p: Project, frameId: string): Raster {
  const f = getFrame(p, frameId),
    data = new Uint8Array(p.width * p.height * 4);
  for (const l of p.layers) {
    if (!l.visible) continue;
    const pixels = f.layers.get(l.id);
    if (!pixels) throw new Error(`Missing layer ${l.id}`);
    for (let i = 0; i < pixels.length; i++) {
      const c = p.palette[pixels[i]!];
      if (!c) throw new Error("Invalid palette index");
      const sa = c[3] / 255;
      if (sa === 0) continue;
      const offset = i * 4,
        da = data[offset + 3]! / 255,
        oa = sa + da * (1 - sa);
      for (let k = 0; k < 3; k++)
        data[offset + k] = Math.round(
          (c[k]! * sa + data[offset + k]! * da * (1 - sa)) / oa,
        );
      data[offset + 3] = Math.round(oa * 255);
    }
  }
  return { width: p.width, height: p.height, data };
}
export function renderAnimationFrame(
  p: Project,
  animation: string,
  index: number,
): Raster {
  const a = getAnimation(p, animation);
  if (!Number.isInteger(index) || !a.frames[index])
    throw new Error("Invalid animation frame index");
  return renderFrame(p, a.frames[index]!.frameId);
}
