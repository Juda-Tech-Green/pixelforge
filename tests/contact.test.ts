import { it, expect } from "vitest";
import sharp from "sharp";
import * as pf from "../packages/core/src/index.js";
import { exportContactSheet } from "../packages/exporters/src/contact.js";
it("exports ordered, labeled, scaled cells with exact source pixels and a companion map", async () => {
  const p = pf.createProject({ name: "Contact", width: 4, height: 4 });
  pf.setPixel(p, "frame-0", "base", 1, 1, 1);
  pf.copyFrame(p, "frame-0", "second");
  pf.setPixel(p, "second", "base", 2, 2, 1);
  pf.addAnimation(p, "walk<&", [
    { frameId: "second", durationMs: 125 },
    { frameId: "frame-0", durationMs: 200 },
  ]);
  pf.addAnimation(p, "idle", [{ frameId: "frame-0", durationMs: 300 }]);
  const result = await exportContactSheet(p, {
    animations: ["walk<&"],
    columns: 2,
    scale: 2,
  });
  const { data, info } = await sharp(result.png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(info.width).toBe(result.map.width);
  expect(info.height).toBe(result.map.height);
  expect(result.map.cells.map((c) => c.frameId)).toEqual(["second", "frame-0"]);
  expect(result.map.cells.map((c) => c.durationMs)).toEqual([125, 200]);
  for (const cell of result.map.cells) {
    const source = pf.renderFrame(p, cell.frameId);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const at = ((cell.y + y) * info.width + cell.x + x) * 4,
          expected = (Math.floor(y / 2) * 4 + Math.floor(x / 2)) * 4;
        expect([...data.subarray(at, at + 4)]).toEqual([
          ...source.data.subarray(expected, expected + 4),
        ]);
      }
    expect(
      data[((cell.label.y + 1) * info.width + cell.label.x + 1) * 4 + 3],
    ).toBe(255);
  }
  expect(data[3]).toBe(0);
  const checker = await exportContactSheet(p, {
    prefix: "walk",
    start: 1,
    end: 2,
    background: "checkerboard",
  });
  expect(checker.map.cells).toHaveLength(1);
  expect(checker.map.cells[0]?.index).toBe(1);
});
it("rejects excessive contact dimensions and unknown animation selection before allocating", async () => {
  const p = pf.createProject({ name: "Bounded", width: 1024, height: 1024 });
  pf.addAnimation(p, "idle", [{ frameId: "frame-0", durationMs: 100 }]);
  await expect(exportContactSheet(p, { scale: 16 })).rejects.toThrow(/bounds/);
  await expect(
    exportContactSheet(p, { animations: ["missing"] }),
  ).rejects.toThrow(/Unknown/);
});
