import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as pf from "../packages/core/src/index.js";
const make = () =>
  pf.createProject({
    name: "test",
    width: 4,
    height: 4,
    palette: [
      [0, 0, 0, 0],
      [255, 0, 0, 255],
      [0, 0, 255, 128],
    ],
  });
const f = "frame-0",
  l = "base";
const grid = (p: pf.Project) => Array.from(pf.getFrame(p, f).layers.get(l)!);
describe("project validation and serialization", () => {
  it("round trips typed arrays without sharing mutable input", () => {
    const p = make(),
      d = pf.toDocument(p),
      q = pf.fromDocument(d);
    pf.setPixel(q, f, l, 0, 0, 1);
    expect(grid(p)[0]).toBe(0);
    expect(
      pf.serializeProject(pf.fromDocument(JSON.parse(pf.serializeProject(p)))),
    ).toBe(pf.serializeProject(p));
  });
  it.each([
    [0, 4],
    [-1, 4],
    [1.5, 4],
    [1025, 1],
    [4, NaN],
  ])("rejects dimensions %s × %s", (width, height) => {
    expect(() => pf.createProject({ name: "bad", width, height })).toThrow();
  });
  it("accepts the smallest and largest supported dimensions", () => {
    expect(
      pf.createProject({ name: "small", width: 1, height: 1 }).frames,
    ).toHaveLength(1);
    expect(
      pf.createProject({ name: "large", width: 1024, height: 1024 }).width,
    ).toBe(1024);
  });
  it("validates fixtures and emits JSON Schema", () => {
    expect(() =>
      pf.fromDocument(
        JSON.parse(readFileSync("tests/fixtures/valid.sprite.json", "utf8")),
      ),
    ).not.toThrow();
    expect(() =>
      pf.fromDocument(
        JSON.parse(readFileSync("tests/fixtures/invalid.sprite.json", "utf8")),
      ),
    ).toThrow(/Palette index/);
    expect(pf.projectJsonSchema.$schema).toContain("2020-12");
  });
  it("rejects unknown versions, unknown fields, and nontransparent index zero", () => {
    const d = pf.toDocument(make());
    expect(() => pf.fromDocument({ ...d, version: "2.0" })).toThrow();
    expect(() => pf.fromDocument({ ...d, extra: true })).toThrow();
    d.palette[0] = [1, 0, 0, 0];
    expect(() => pf.fromDocument(d)).toThrow(/index 0/);
  });
  it("rejects missing layers, short grids, duplicate IDs and animation references", () => {
    const d = pf.toDocument(make());
    d.frames[0]!.layers.base = [];
    expect(() => pf.fromDocument(d)).toThrow(/16 pixels/);
    delete d.frames[0]!.layers.base;
    expect(() => pf.fromDocument(d)).toThrow(/Missing layer/);
    const q = pf.toDocument(make());
    q.layers.push({ ...q.layers[0]! });
    expect(() => pf.fromDocument(q)).toThrow(/unique/);
    q.layers.pop();
    q.animations = [
      {
        name: "bad",
        loop: true,
        frames: [{ frameId: "missing", durationMs: 100 }],
      },
    ];
    expect(() => pf.fromDocument(q)).toThrow(/reference/);
  });
});
describe("pixel operations", () => {
  it("sets, reads and clears with strict boundaries and index validation", () => {
    const p = make();
    pf.setPixel(p, f, l, 3, 3, 1);
    expect(pf.getPixel(p, f, l, 3, 3)).toBe(1);
    pf.clearPixel(p, f, l, 3, 3);
    expect(grid(p).every((x) => x === 0)).toBe(true);
    for (const [x, y, c] of [
      [-1, 0, 1],
      [4, 0, 1],
      [0, 4, 1],
      [0.5, 0, 1],
      [0, 0, 3],
    ])
      expect(() => pf.setPixel(p, f, l, x!, y!, c!)).toThrow();
    expect(() => pf.getPixel(p, f, "missing", 0, 0)).toThrow();
  });
  it("draws all line octants with exact endpoints", () => {
    for (const [x, y] of [
      [0, 0],
      [3, 0],
      [0, 3],
      [3, 3],
      [1, 3],
      [3, 1],
    ]) {
      const p = make();
      pf.drawLine(p, f, l, 1, 1, x!, y!, 1);
      expect(pf.getPixel(p, f, l, 1, 1)).toBe(1);
      expect(pf.getPixel(p, f, l, x!, y!)).toBe(1);
      const q = make();
      pf.drawLine(q, f, l, x!, y!, 1, 1, 1);
      expect(grid(q).filter((v) => v === 1).length).toBe(
        grid(p).filter((v) => v === 1).length,
      );
    }
  });
  it("clips rectangles and draws one-pixel outlines", () => {
    const p = make();
    pf.drawRect(p, f, l, -1, -1, 3, 3, 1);
    expect(grid(p)).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    pf.clearFrame(p, f);
    pf.drawRect(p, f, l, 0, 0, 4, 4, 1, false);
    expect(grid(p).filter((v) => v === 1)).toHaveLength(12);
    expect(() => pf.drawRect(p, f, l, 0, 0, 0, 1, 1)).toThrow();
  });
  it("rasterizes ellipses symmetrically and handles degenerate dimensions", () => {
    const p = make();
    pf.drawEllipse(p, f, l, 0, 0, 4, 4, 1);
    expect(grid(p)).toEqual([0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0]);
    pf.clearFrame(p, f);
    pf.drawEllipse(p, f, l, 0, 0, 1, 4, 1);
    expect(grid(p).filter((v) => v === 1)).toHaveLength(4);
    pf.clearFrame(p, f);
    pf.drawEllipse(p, f, l, 0, 0, 4, 4, 1, false);
    expect(pf.getPixel(p, f, l, 1, 1)).toBe(0);
  });
  it("flood fills four-connected regions including transparent pixels", () => {
    const p = make();
    pf.drawLine(p, f, l, 2, 0, 2, 3, 1);
    pf.floodFill(p, f, l, 0, 0, 2);
    expect(grid(p)).toEqual([2, 2, 1, 0, 2, 2, 1, 0, 2, 2, 1, 0, 2, 2, 1, 0]);
    pf.floodFill(p, f, l, 0, 0, 2);
    expect(pf.getPixel(p, f, l, 3, 0)).toBe(0);
  });
  it("moves overlap safely, clears sources, clips, and overwrites with transparency", () => {
    const p = make();
    pf.setPixel(p, f, l, 0, 0, 1);
    pf.setPixel(p, f, l, 1, 0, 2);
    pf.setPixel(p, f, l, 3, 0, 1);
    pf.moveRegion(p, f, l, 0, 0, 3, 1, 1, 0);
    expect(grid(p).slice(0, 4)).toEqual([0, 1, 2, 0]);
    pf.moveRegion(p, f, l, 1, 0, 2, 1, -2, 0);
    expect(grid(p).slice(0, 4)).toEqual([2, 0, 0, 0]);
  });
  it("flips, replaces colors including index zero, and clears all layers", () => {
    const p = make();
    pf.setPixel(p, f, l, 0, 0, 1);
    pf.flipHorizontal(p, f, l);
    expect(pf.getPixel(p, f, l, 3, 0)).toBe(1);
    pf.flipVertical(p, f, l);
    expect(pf.getPixel(p, f, l, 3, 3)).toBe(1);
    pf.replaceColor(p, f, l, 1, 2);
    expect(pf.getPixel(p, f, l, 3, 3)).toBe(2);
    pf.createLayer(p, "top");
    pf.setPixel(p, f, "top", 0, 0, 1);
    pf.clearFrame(p, f);
    expect(pf.renderFrame(p, f).data.every((v) => v === 0)).toBe(true);
  });
});
describe("frames and animations", () => {
  it("preserves distinct timed entries when animation references repeat", () => {
    const p = make();
    pf.addAnimation(p, "repeat", [
      { frameId: f, durationMs: 10 },
      { frameId: f, durationMs: 20 },
    ]);
    expect(pf.animationFrameIndexAt(p, "repeat", 9)).toBe(0);
    expect(pf.animationFrameIndexAt(p, "repeat", 10)).toBe(1);
    expect(pf.animationFrameIndexAt(p, "repeat", 30)).toBe(0);
    expect(() => pf.animationFrameIndexAt(p, "repeat", NaN)).toThrow();
  });
  it("duplicates independently and reorders without changing animation references", () => {
    const p = make();
    pf.setPixel(p, f, l, 0, 0, 1);
    pf.copyFrame(p, f, "b");
    pf.setPixel(p, "b", l, 0, 0, 2);
    expect(pf.getPixel(p, f, l, 0, 0)).toBe(1);
    pf.addAnimation(p, "walk", [
      { frameId: f, durationMs: 100 },
      { frameId: "b", durationMs: 200 },
    ]);
    pf.reorderFrames(p, ["b", f]);
    expect(p.frames[0]!.id).toBe("b");
    expect(p.animations[0]!.frames[0]!.frameId).toBe(f);
    expect(() => pf.removeFrame(p, f)).toThrow(/references/);
    expect(() => pf.reorderFrames(p, [f, "missing"])).toThrow();
    expect(p.frames[0]!.id).toBe("b");
  });
  it("edits animation entries and validates timing and looping", () => {
    const p = make();
    pf.createFrame(p, "b");
    pf.addAnimation(p, "walk", [{ frameId: f, durationMs: 100 }]);
    pf.addAnimationFrame(p, "walk", "b", 200);
    expect(pf.animationFrameAt(p, "walk", 99).frameId).toBe(f);
    expect(pf.animationFrameAt(p, "walk", 100).frameId).toBe("b");
    expect(pf.animationFrameAt(p, "walk", 300).frameId).toBe(f);
    p.animations[0]!.loop = false;
    expect(pf.animationFrameAt(p, "walk", 1000).frameId).toBe("b");
    pf.setFrameDuration(p, "walk", 1, 250);
    pf.reorderAnimationFrames(p, "walk", [1, 0]);
    pf.renameAnimation(p, "walk", "idle");
    expect(pf.getAnimation(p, "idle").frames[0]!.durationMs).toBe(250);
    pf.removeAnimationFrame(p, "idle", 0);
    pf.removeFrame(p, "b");
    expect(() => pf.setFrameDuration(p, "idle", 0, 0)).toThrow();
    expect(() => pf.removeAnimationFrame(p, "idle", 0)).toThrow();
  });
});
describe("RGBA renderer and operation transactions", () => {
  it("composites bottom to top using straight-alpha source-over", () => {
    const p = make();
    pf.setPixel(p, f, l, 0, 0, 1);
    pf.createLayer(p, "top");
    pf.setPixel(p, f, "top", 0, 0, 2);
    expect(Array.from(pf.renderFrame(p, f).data.slice(0, 4))).toEqual([
      127, 0, 128, 255,
    ]);
    p.layers[1]!.visible = false;
    expect(Array.from(pf.renderFrame(p, f).data.slice(0, 4))).toEqual([
      255, 0, 0, 255,
    ]);
  });
  it("keeps exact semi-transparent colors over transparency and deterministic output", () => {
    const p = make();
    pf.setPixel(p, f, l, 0, 0, 2);
    expect(Array.from(pf.renderFrame(p, f).data.slice(0, 4))).toEqual([
      0, 0, 255, 128,
    ]);
    expect(pf.renderFrame(p, f)).toEqual(pf.renderFrame(p, f));
  });
  it("commits batches to a clone and rolls back execution failures", () => {
    const p = make(),
      before = pf.serializeProject(p);
    expect(() =>
      pf.applyOperations(p, {
        version: "1.0",
        operations: [
          { op: "setPixel", frame: f, layer: l, x: 0, y: 0, color: 1 },
          { op: "setPixel", frame: f, layer: l, x: 9, y: 0, color: 1 },
        ],
      }),
    ).toThrow(/Operation 1/);
    expect(pf.serializeProject(p)).toBe(before);
    const next = pf.applyOperations(p, {
      version: "1.0",
      operations: [
        {
          op: "drawRect",
          frame: f,
          layer: l,
          x: 0,
          y: 0,
          width: 2,
          height: 2,
          color: 1,
        },
        { op: "copyFrame", source: f, id: "copy" },
      ],
    });
    expect(next.frames).toHaveLength(2);
    expect(grid(p)[0]).toBe(0);
    expect(() =>
      pf.applyOperations(p, {
        version: "1.0",
        operations: [{ op: "unknown" }],
      }),
    ).toThrow();
  });
});
