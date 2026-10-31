import { it, expect } from "vitest";
import * as pf from "../packages/core/src/index.js";
import { EditorHistory } from "../apps/web/src/editor/history.js";
import { DrawingGesture, mapPointer } from "../apps/web/src/editor/gesture.js";
const make = () => pf.createProject({ name: "Editor", width: 16, height: 16 });
it("interpolates a rapid pencil gesture and commits it as one undo action", () => {
  const p = make(),
    history = new EditorHistory(p),
    g = new DrawingGesture(
      p,
      "frame-0",
      "base",
      "pencil",
      1,
      { x: 0, y: 0 },
      true,
    );
  g.move({ x: 15, y: 15 });
  history.commit(g.finish(), "Pencil");
  expect(pf.getPixel(p, "frame-0", "base", 0, 0)).toBe(0);
  for (let i = 0; i < 16; i++)
    expect(pf.getPixel(history.project(), "frame-0", "base", i, i)).toBe(1);
  expect(
    pf.renderFrame(history.undo(), "frame-0").data.every((v) => v === 0),
  ).toBe(true);
  expect(history.canUndo).toBe(false);
  expect(pf.getPixel(history.redo(), "frame-0", "base", 15, 15)).toBe(1);
});
it("cancels drafts, previews shapes without trails, and erases transparently", () => {
  const p = make(),
    g = new DrawingGesture(
      p,
      "frame-0",
      "base",
      "rectangle",
      1,
      { x: 1, y: 1 },
      false,
    );
  g.move({ x: 10, y: 10 });
  g.move({ x: 3, y: 3 });
  expect(pf.getPixel(g.draft, "frame-0", "base", 10, 10)).toBe(0);
  expect(g.cancel()).toBe(p);
  expect(pf.getPixel(p, "frame-0", "base", 1, 1)).toBe(0);
  const erase = new DrawingGesture(
    g.finish(),
    "frame-0",
    "base",
    "eraser",
    1,
    { x: 1, y: 1 },
    true,
  );
  expect(pf.getPixel(erase.finish(), "frame-0", "base", 1, 1)).toBe(0);
});
it("maps CSS coordinates independent of DPR after viewport translation and scale", () => {
  expect(
    mapPointer(
      128,
      244,
      { left: 100, top: 200, width: 128, height: 128 },
      16,
      16,
    ),
  ).toEqual({ x: 3, y: 5 });
  expect(
    mapPointer(
      99,
      199,
      { left: 100, top: 200, width: 128, height: 128 },
      16,
      16,
    ),
  ).toEqual({ x: -1, y: -1 });
});
it("restores structures, invalidates redo, resets on import and tracks saved state", () => {
  const p = make(),
    h = new EditorHistory(p);
  pf.createLayer(p, "top");
  h.commit(p, "Layer");
  p.layers[1]!.name = "Later";
  expect(h.project().layers[1]!.name).toBe("top");
  expect(h.dirty).toBe(true);
  h.markSaved();
  expect(h.dirty).toBe(false);
  h.undo();
  expect(h.dirty).toBe(true);
  expect(h.redo().layers).toHaveLength(2);
  const q = h.undo();
  pf.createFrame(q, "new");
  h.commit(q, "Frame");
  expect(h.canRedo).toBe(false);
  h.replace(make());
  expect(h.dirty).toBe(false);
  expect(h.canUndo).toBe(false);
});
it("enforces entry and memory budgets even for oversized checkpoints", () => {
  const p = make(),
    h = new EditorHistory(p, 2, 100000);
  for (let i = 0; i < 4; i++) {
    pf.setPixel(p, "frame-0", "base", i, 0, 1);
    h.commit(p, "Dot");
  }
  h.undo();
  h.undo();
  expect(h.canUndo).toBe(false);
  const tiny = new EditorHistory(p, 10, 1);
  pf.clearFrame(p, "frame-0");
  tiny.commit(p, "Clear");
  expect(tiny.retainedBytes).toBe(0);
  expect(tiny.canUndo).toBe(false);
});
