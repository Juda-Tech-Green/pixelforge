import { it, expect } from "vitest";
import * as pf from "../packages/core/src/index.js";
const make = () => pf.createProject({ name: "Game", width: 32, height: 32 });
it("keeps old documents valid and validates namespaced metadata", () => {
  const p = make();
  expect(pf.getGameMetadata(p).origin).toEqual({ x: 0.5, y: 0.5 });
  const game = pf.getGameMetadata(p);
  game.body = { type: "rectangle", x: 9, y: 8, width: 14, height: 22 };
  pf.setGameMetadata(p, game);
  expect(pf.fromDocument(pf.toDocument(p)).metadata).toEqual(p.metadata);
  game.body = { type: "circle", x: 0, y: 0, radius: 17 };
  expect(() => pf.setGameMetadata(p, game)).toThrow(/bounds/);
});
it("rejects malformed versions, geometry, identifiers and references during project validation", () => {
  const p = make(),
    g = pf.getGameMetadata(p);
  g.boxes = [
    {
      id: "attack",
      name: "weapon",
      kind: "hitbox",
      scope: { type: "entry", animation: "missing", index: 0 },
      rect: { x: 1, y: 2, width: 4, height: 4 },
      enabled: true,
    },
  ];
  expect(() => pf.setGameMetadata(p, g)).toThrow(/animation/);
  const d = pf.toDocument(p);
  d.metadata = { pixelforgeGame: { version: "9" } };
  expect(() => pf.fromDocument(d)).toThrow();
});
it("resolves scoped overrides, including explicit inactive attack windows", () => {
  const g = pf.getGameMetadata(make());
  const b: pf.GameBox = {
    id: "a",
    name: "weapon",
    kind: "hitbox",
    scope: { type: "project" },
    rect: { x: 0, y: 0, width: 2, height: 2 },
    enabled: true,
  };
  g.boxes = [
    b,
    {
      ...b,
      id: "b",
      scope: { type: "entry", animation: "attack", index: 1 },
      enabled: false,
    },
  ];
  expect(pf.resolveGameBoxes(g, "frame-0", "attack", 0)).toHaveLength(1);
  expect(pf.resolveGameBoxes(g, "frame-0", "attack", 1)).toHaveLength(0);
});
it("transforms untrimmed rectangles with origin, flip and nonuniform scale", () => {
  expect(
    pf.boxToWorld({ x: 2, y: 3, width: 4, height: 5 }, 32, 32, {
      x: 100,
      y: 200,
      originX: 0.5,
      originY: 1,
      scaleX: 2,
      scaleY: 3,
      flipX: true,
    }),
  ).toEqual({ x: 120, y: 113, width: 8, height: 15 });
  expect(() =>
    pf.boxToWorld({ x: 0, y: 0, width: 1, height: 1 }, 32, 32, {
      x: 0,
      y: 0,
      originX: 0,
      originY: 0,
      scaleX: 1,
      scaleY: 1,
      flipX: false,
      rotation: 1,
    }),
  ).toThrow(/Rotated/);
});
