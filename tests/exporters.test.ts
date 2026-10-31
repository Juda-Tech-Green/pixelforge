import { it, expect } from "vitest";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import {
  createProject,
  createFrame,
  setPixel,
  fromDocument,
  renderFrame,
  addAnimation,
} from "../packages/core/src/index.js";
import {
  exportFramePNG,
  exportSpriteSheet,
  renderSpriteSheet,
} from "../packages/exporters/src/index.js";
it("matches the hand-authored decoded RGBA golden fixture", async () => {
  const p = fromDocument(
      JSON.parse(readFileSync("tests/fixtures/valid.sprite.json", "utf8")),
    ),
    golden: unknown = JSON.parse(
      readFileSync("tests/fixtures/golden.rgba.json", "utf8"),
    );
  const png = await exportFramePNG(p, "frame-0"),
    { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  expect([info.width, info.height, info.channels]).toEqual([2, 2, 4]);
  expect(Array.from(data)).toEqual(golden);
  expect(Array.from(renderFrame(p, "frame-0").data)).toEqual(golden);
  expect(await exportFramePNG(p, "frame-0")).toEqual(png);
});
it("positions equal-sized cells, transparent empty frames and padding in row-major order", async () => {
  const p = createProject({ name: "sheet", width: 2, height: 2 });
  setPixel(p, "frame-0", "base", 1, 1, 1);
  createFrame(p, "empty");
  createFrame(p, "third");
  setPixel(p, "third", "base", 0, 0, 1);
  addAnimation(p, "walk", [
    { frameId: "third", durationMs: 90 },
    { frameId: "frame-0", durationMs: 150 },
  ]);
  const { png, manifest } = await exportSpriteSheet(p, {
    columns: 2,
    padding: 1,
  });
  const { data, info } = await sharp(png)
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect([info.width, info.height]).toEqual([5, 5]);
  expect(manifest.frames.map((f) => [f.x, f.y])).toEqual([
    [0, 0],
    [3, 0],
    [0, 3],
  ]);
  expect(data[(1 * 5 + 1) * 4 + 3]).toBe(255);
  expect(data[3 * 5 * 4 + 3]).toBe(255);
  expect(data[(0 * 5 + 3) * 4 + 3]).toBe(0);
  expect(data[(2 * 5 + 2) * 4 + 3]).toBe(0);
  expect(manifest.animations[0]!.frames).toEqual([
    { index: 2, durationMs: 90 },
    { index: 0, durationMs: 150 },
  ]);
  expect(renderSpriteSheet(p).manifest.width).toBe(6);
  expect(() => renderSpriteSheet(p, { columns: 0 })).toThrow();
  expect(() => renderSpriteSheet(p, { padding: -1 })).toThrow();
});
