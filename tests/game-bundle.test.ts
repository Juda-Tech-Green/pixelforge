import { it, expect } from "vitest";
import * as pf from "../packages/core/src/index.js";
const make = () => pf.createProject({ name: "Hero", width: 16, height: 16 });
it("applies metadata batches atomically and rejects dangling references", () => {
  const source = make(),
    box = {
      id: "blade",
      kind: "hitbox",
      name: "weapon",
      scope: { type: "entry", animation: "attack", index: 1 },
      rect: { x: 9, y: 5, width: 7, height: 4 },
      enabled: true,
    };
  const p = pf.applyOperations(source, {
    version: "1.0",
    operations: [
      { op: "copyFrame", source: "frame-0", id: "swing" },
      {
        op: "addAnimation",
        name: "attack",
        frames: [
          { frameId: "frame-0", durationMs: 90 },
          { frameId: "swing", durationMs: 150 },
        ],
        loop: false,
      },
      { op: "setSpriteOrigin", origin: { x: 0.5, y: 1 } },
      {
        op: "setCollisionBody",
        body: { type: "circle", x: 2, y: 2, radius: 6 },
      },
      { op: "addGameBox", box },
      {
        op: "setAnimationEvent",
        event: {
          id: "strike",
          animation: "attack",
          index: 1,
          name: "attack_start",
        },
      },
      {
        op: "setAnchor",
        anchor: {
          id: "hand",
          name: "hand",
          x: 9,
          y: 6,
          scope: { type: "project" },
        },
      },
    ],
  });
  expect(pf.getGameMetadata(source).boxes).toHaveLength(0);
  expect(pf.getGameMetadata(p).boxes).toHaveLength(1);
  const before = pf.serializeProject(p);
  expect(() =>
    pf.applyOperations(p, {
      version: "1.0",
      operations: [
        { op: "clearCollisionBody" },
        { op: "removeAnimationFrame", name: "attack", index: 1 },
      ],
    }),
  ).toThrow();
  expect(pf.serializeProject(p)).toBe(before);
  const clean = pf.applyOperations(p, {
    version: "1.0",
    operations: [
      { op: "removeGameBox", id: "blade" },
      { op: "removeAnimationEvent", id: "strike" },
      { op: "removeAnchor", id: "hand" },
      { op: "removeAnimationFrame", name: "attack", index: 1 },
      { op: "clearCollisionBody" },
    ],
  });
  expect(pf.getGameMetadata(clean).body).toBeUndefined();
});
it("produces consistent native atlas and fixed-sheet bundles without duplicating animation references", () => {
  const p = make();
  pf.copyFrame(p, "frame-0", "other");
  pf.addAnimation(p, "walk", [
    { frameId: "other", durationMs: 100 },
    { frameId: "other", durationMs: 200 },
    { frameId: "frame-0", durationMs: 50 },
  ]);
  const atlas = pf.assemblePhaserBundle(p, {
      name: "hero",
      layout: "atlas",
      maxWidth: 64,
      maxHeight: 64,
    }),
    sheet = pf.assemblePhaserBundle(p, {
      name: "hero",
      layout: "spritesheet",
      columns: 1,
      padding: 2,
    });
  expect(
    Object.keys(JSON.parse(atlas.files["hero.atlas.json"]!).frames),
  ).toEqual(["frame-0", "other"]);
  expect(atlas.animationData).toEqual(sheet.animationData);
  expect(atlas.gameData).toEqual(sheet.gameData);
  expect(
    atlas.animationData.animations[0]!.frames.map((f) => f.durationMs),
  ).toEqual([100, 200, 50]);
  expect(sheet.manifest.columns).toBe(1);
  expect(sheet.raster.height).toBe(34);
  expect(() => pf.assemblePhaserBundle(p, { name: "../bad" })).toThrow(/safe/);
  expect(() => pf.assemblePhaserBundle(p, { maxWidth: 1 })).toThrow(/fit/);
});
