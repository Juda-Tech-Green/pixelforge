import { it, expect } from "vitest";
import * as pf from "../packages/core/src/index.js";
import { RasterCache } from "../apps/web/src/editor/raster-cache.js";
it("reuses unchanged frames across commits and invalidates pixel/palette/layer changes", () => {
  const p = pf.createProject({ name: "Cache", width: 2, height: 2 });
  pf.createFrame(p, "other");
  const cache = new RasterCache(),
    a = cache.get(p, "frame-0");
  const q = pf.cloneProject(p);
  pf.setPixel(q, "other", "base", 0, 0, 1);
  expect(cache.get(q, "frame-0")).toBe(a);
  pf.setPixel(q, "frame-0", "base", 0, 0, 1);
  const b = cache.get(q, "frame-0");
  expect(b).not.toBe(a);
  pf.updatePaletteColor(q, 1, [255, 0, 0, 255]);
  expect(cache.get(q, "frame-0").data[1]).toBe(0);
  pf.setLayerVisibility(q, "base", false);
  expect(cache.get(q, "frame-0").data.every((v) => v === 0)).toBe(true);
  const tiny = new RasterCache(1);
  expect(tiny.get(p, "frame-0")).not.toBe(tiny.get(p, "frame-0"));
});
