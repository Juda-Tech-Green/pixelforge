import { it, expect } from "vitest";
import * as pf from "../packages/core/src/index.js";
const make = () => pf.createProject({ name: "Batch", width: 4, height: 4 });
it("builds and edits an animation entirely through operation files", () => {
  const p = pf.applyOperations(make(), {
    version: "1.0",
    operations: [
      {
        op: "drawRect",
        frame: "frame-0",
        layer: "base",
        x: 0,
        y: 0,
        width: 2,
        height: 2,
        color: 1,
      },
      { op: "copyFrame", source: "frame-0", id: "second" },
      {
        op: "addAnimation",
        name: "walk",
        frames: [{ frameId: "frame-0", durationMs: 100 }],
      },
      {
        op: "addAnimationFrame",
        name: "walk",
        frameId: "second",
        durationMs: 200,
        index: 0,
      },
      { op: "setFrameDuration", name: "walk", index: 1, durationMs: 300 },
      { op: "reorderAnimationFrames", name: "walk", indices: [1, 0] },
      { op: "setAnimationLoop", name: "walk", loop: false },
      { op: "renameAnimation", name: "walk", newName: "idle" },
      { op: "reorderFrames", ids: ["second", "frame-0"] },
    ],
  });
  expect(p.frames.map((f) => f.id)).toEqual(["second", "frame-0"]);
  expect(p.animations[0]).toEqual({
    name: "idle",
    loop: false,
    frames: [
      { frameId: "frame-0", durationMs: 300 },
      { frameId: "second", durationMs: 200 },
    ],
  });
  const result = pf.applyOperations(p, {
    version: "1.0",
    operations: [
      { op: "removeAnimationFrame", name: "idle", index: 1 },
      { op: "removeFrame", id: "second" },
      { op: "removeAnimation", name: "idle" },
    ],
  });
  expect(result.frames).toHaveLength(1);
  expect(result.animations).toHaveLength(0);
});
it("routes all layer and palette batch mutations through invariant-preserving APIs", () => {
  const p = pf.applyOperations(make(), {
    version: "1.0",
    operations: [
      { op: "createLayer", id: "top" },
      { op: "renameLayer", id: "top", name: "Light" },
      { op: "setLayerVisibility", id: "top", visible: false },
      { op: "reorderLayers", ids: ["top", "base"] },
      { op: "addPaletteColor", color: [255, 0, 0, 255] },
      { op: "updatePaletteColor", index: 2, color: [10, 20, 30, 128] },
      { op: "removePaletteColor", index: 1 },
      { op: "removeLayer", id: "base" },
    ],
  });
  expect(p.layers).toEqual([{ id: "top", name: "Light", visible: false }]);
  expect(p.palette).toEqual([
    [0, 0, 0, 0],
    [10, 20, 30, 128],
  ]);
  expect([...p.frames[0]!.layers.keys()]).toEqual(["top"]);
  pf.toDocument(p);
});
it.each([
  { op: "removeFrame", id: "missing" },
  { op: "removeLayer", id: "base" },
  { op: "removePaletteColor", index: 0 },
  { op: "reorderLayers", ids: ["missing"] },
  {
    op: "addAnimation",
    name: "bad",
    frames: [{ frameId: "absent", durationMs: 100 }],
  },
  { op: "updatePaletteColor", index: 1, color: [999, 0, 0, 255] },
  { op: "setAnimationLoop", name: "missing", loop: true },
])("rolls back an entire structural batch on failure: %j", (operation) => {
  const p = make(),
    before = pf.serializeProject(p);
  expect(() =>
    pf.applyOperations(p, {
      version: "1.0",
      operations: [{ op: "createFrame", id: "new" }, operation],
    }),
  ).toThrow();
  expect(pf.serializeProject(p)).toBe(before);
});
