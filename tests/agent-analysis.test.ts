import { it, expect } from "vitest";
import * as pf from "../packages/core/src/index.js";
it("bounds inspection of many frames/layers/animations without serializing pixel grids", () => {
  const p = pf.createProject({ name: "Large", width: 48, height: 64 });
  for (let l = 1; l < 8; l++) pf.createLayer(p, `layer-${l}`);
  for (let i = 1; i < 80; i++) pf.copyFrame(p, "frame-0", `frame-${i}`);
  for (let i = 0; i < 40; i++)
    pf.addAnimation(
      p,
      `walk-${i}`,
      p.frames.map((f) => ({ frameId: f.id, durationMs: 100 })),
    );
  const summary = pf.inspectProject(p, { sourceBytes: 13000000 });
  expect(JSON.stringify(summary).length).toBeLessThan(32768);
  expect(summary.frameCount).toBe(80);
  expect(summary.animations.truncated).toBe(true);
  const selected = pf.inspectProject(p, { animation: "walk-0", limit: 2 });
  expect(
    "selectedAnimation" in selected && selected.selectedAnimation.entries.items,
  ).toHaveLength(2);
  expect(JSON.stringify(selected)).not.toContain("pixels");
  const after = pf.applyOperations(p, {
    version: "1.0",
    operations: [
      {
        op: "setPixel",
        frame: "frame-5",
        layer: "layer-2",
        x: 2,
        y: 3,
        color: 1,
      },
    ],
  });
  const diff = pf.diffProjects(p, after, {
    preserveFrames: ["frame-0"],
    preserveLayers: ["base"],
    preserveGame: true,
  });
  expect(diff.ok).toBe(true);
  expect(diff.changedSourceFrames.total).toBe(1);
  expect(diff.changedPixelCount).toBe(1);
  expect(diff.warnings.total).toBe(1);
  expect(pf.diffProjects(p, after, { preserveFrames: ["frame-5"] }).ok).toBe(
    false,
  );
});
it("derives every discoverable operation and valid example from the authoritative union", () => {
  expect(pf.listOperations()).toContain("setAnchor");
  for (const name of pf.listOperations()) {
    const description = pf.describeOperation(name);
    expect(() => pf.operationSchema.parse(description.example)).not.toThrow();
    expect(description.fields.find((f) => f.name === "op")?.required).toBe(
      true,
    );
  }
  expect(() => pf.describeOperation("unknown")).toThrow(/operations list/);
});
it("reports precise strict pixel targets while shapes retain clipped behavior", () => {
  const p = pf.createProject({ name: "Bounds", width: 4, height: 4 });
  expect(() =>
    pf.applyOperations(p, {
      version: "1.0",
      operations: [
        {
          op: "setPixel",
          frame: "frame-0",
          layer: "base",
          x: -1,
          y: 2,
          color: 1,
        },
      ],
    }),
  ).toThrow(
    /Operation 0.*frame=frame-0.*layer=base.*coordinate=\(-1,2\).*canvas=4x4.*0\.\.3/,
  );
  expect(() => pf.drawRect(p, "frame-0", "base", -1, 0, 2, 2, 1)).not.toThrow();
});
it("checks explicit effect coverage, timing, baseline warnings and intentional exceptions", () => {
  const p = pf.createProject({ name: "Effects", width: 4, height: 4 });
  pf.createLayer(p, "aura");
  pf.setPixel(p, "frame-0", "base", 1, 3, 1);
  pf.copyFrame(p, "frame-0", "second");
  pf.clearFrame(p, "second");
  pf.setPixel(p, "second", "base", 1, 0, 1);
  pf.addAnimation(p, "idle", [
    { frameId: "frame-0", durationMs: 100 },
    { frameId: "second", durationMs: 200 },
  ]);
  const contract = {
    version: "1.0",
    requiredAnimations: ["idle", "attack"],
    requiredAnchors: ["weapon"],
    animations: [
      {
        name: "idle",
        layerPhases: [
          { layer: "aura", minDistinctPhases: 2, minVisibleEntries: 2 },
        ],
        durationsMs: [100, 100],
        baselineTolerance: 0,
      },
    ],
  };
  const result = pf.checkSemantics(p, contract);
  expect(result.ok).toBe(false);
  expect(result.semanticViolations.map((v) => v.check)).toEqual(
    expect.arrayContaining([
      "requiredAnimation",
      "anchor",
      "phases",
      "coverage",
      "timing",
    ]),
  );
  expect(result.visualWarnings[0]?.check).toBe("baseline");
  expect(
    pf.checkSemantics(p, {
      ...contract,
      exceptions: [
        {
          animation: "attack",
          check: "requiredAnimation",
          reason: "Attack deferred by task",
        },
      ],
    }).intentionalExceptions,
  ).toHaveLength(1);
  pf.setPixel(p, "frame-0", "aura", 0, 0, 1);
  pf.setPixel(p, "second", "aura", 1, 0, 1);
  expect(
    pf.checkSemantics(p, {
      version: "1.0",
      animations: [
        {
          name: "idle",
          layerPhases: [
            { layer: "aura", minDistinctPhases: 2, minVisibleEntries: 2 },
          ],
        },
      ],
    }).ok,
  ).toBe(true);
  p.layers.find((l) => l.id === "aura")!.visible = false;
  expect(
    pf.checkSemantics(p, {
      version: "1.0",
      animations: [
        {
          name: "idle",
          layerPhases: [{ layer: "aura", minDistinctPhases: 2 }],
        },
      ],
    }).ok,
  ).toBe(false);
});
