import { it, expect } from "vitest";
import * as pf from "../packages/core/src/index.js";
it("packs all frames deterministically and reconstructs exact pixels including empty frames", () => {
  const p = pf.createProject({ name: "Atlas", width: 3, height: 2 });
  pf.setPixel(p, "frame-0", "base", 2, 1, 1);
  pf.copyFrame(p, "frame-0", "second");
  pf.createFrame(p, "empty");
  const result = pf.renderAtlas(p, {
    maxWidth: 8,
    maxHeight: 8,
    padding: 1,
    powerOfTwo: true,
  });
  expect([result.raster.width, result.raster.height]).toEqual([8, 8]);
  expect(
    pf.renderAtlas(p, {
      maxWidth: 8,
      maxHeight: 8,
      padding: 1,
      powerOfTwo: true,
    }),
  ).toEqual(result);
  for (const f of p.frames) {
    const bounds = result.atlas.frames[f.id]!.frame,
      original = pf.renderFrame(p, f.id).data;
    for (let y = 0; y < p.height; y++)
      for (let x = 0; x < p.width; x++) {
        const offset =
          ((bounds.y + y) * result.raster.width + bounds.x + x) * 4;
        expect(
          Array.from(result.raster.data.slice(offset, offset + 4)),
        ).toEqual(
          Array.from(
            original.slice((y * p.width + x) * 4, (y * p.width + x + 1) * 4),
          ),
        );
      }
  }
  expect(result.atlas.frames.empty!.trimmed).toBe(false);
  expect(result.raster.data[(0 * 8 + 3) * 4 + 3]).toBe(0);
  expect(() => pf.renderAtlas(p, { maxWidth: 2 })).toThrow(/fit/);
  expect(() => pf.renderAtlas(p, { maxWidth: 3, maxHeight: 2 })).toThrow(/fit/);
  expect(() => pf.renderAtlas(p, { padding: -1 })).toThrow();
});
it("keeps scoped events and boxes attached after animation insertion/reorder/rename and rejects destructive removal", () => {
  const p = pf.createProject({ name: "Scopes", width: 8, height: 8 });
  pf.createFrame(p, "second");
  pf.addAnimation(p, "attack", [
    { frameId: "frame-0", durationMs: 100 },
    { frameId: "second", durationMs: 200 },
  ]);
  const g = pf.getGameMetadata(p);
  g.events = [
    { id: "hit", animation: "attack", index: 1, name: "attack_start" },
  ];
  pf.setGameMetadata(p, g);
  pf.reorderAnimationFrames(p, "attack", [1, 0]);
  expect(pf.getGameMetadata(p).events[0]!.index).toBe(0);
  pf.addAnimationFrame(p, "attack", "frame-0", 50, 0);
  expect(pf.getGameMetadata(p).events[0]!.index).toBe(1);
  pf.renameAnimation(p, "attack", "swing");
  expect(pf.getGameMetadata(p).events[0]!.animation).toBe("swing");
  expect(() => pf.removeAnimationFrame(p, "swing", 1)).toThrow(
    /metadata|events/,
  );
  expect(() => pf.removeAnimation(p, "swing")).toThrow(/metadata/);
  pf.toDocument(p);
});
