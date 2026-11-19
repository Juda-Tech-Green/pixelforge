import { z } from "zod";
const id = z.string().min(1).max(128), index = z.number().int().min(1).max(255);
const unit = z.number().min(0).max(1);
const direction = z.enum(["horizontal", "vertical"]).default("horizontal");
const scale = z.number().int().min(1).max(8).default(1);
const common = { format: z.literal("pixelforge-material"), version: z.literal("1.0"), id,
  seed: z.number().int().min(0).max(4294967295), intensity: unit.default(1),
  origin: z.tuple([z.number().int().min(-1024).max(1024), z.number().int().min(-1024).max(1024)]).default([0, 0]),
  palette: z.strictObject({ base: index, highlight: index, shadow: index, mortar: index.optional() }),
};
export const materialSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...common, type: z.literal("wood"), parameters: z.strictObject({ direction, scale,
    density: z.number().min(0).max(.45).default(.22), variation: z.number().min(0).max(.5).default(.2), wear: z.number().min(0).max(.15).default(.03),
  }).default({ direction: "horizontal", scale: 1, density: .22, variation: .2, wear: .03 }) }),
  z.strictObject({ ...common, type: z.literal("metal"), parameters: z.strictObject({ direction, scale,
    density: z.number().min(0).max(.25).default(.1), scratches: z.number().min(0).max(.1).default(.02), wear: z.number().min(0).max(.1).default(.01),
  }).default({ direction: "horizontal", scale: 1, density: .1, scratches: .02, wear: .01 }) }),
  z.strictObject({ ...common, type: z.literal("plaster"), parameters: z.strictObject({
    patchSize: z.number().int().min(2).max(16).default(6), density: z.number().min(0).max(.4).default(.25), variation: z.number().min(0).max(.5).default(.2),
  }).default({ patchSize: 6, density: .25, variation: .2 }) }),
  z.strictObject({ ...common, type: z.literal("brick"), parameters: z.strictObject({
    brickWidth: z.number().int().min(3).max(32).default(8), brickHeight: z.number().int().min(3).max(16).default(4),
    mortarWidth: z.number().int().min(1).max(3).default(1), stagger: z.boolean().default(true), variation: z.number().min(0).max(.3).default(.12),
  }).default({ brickWidth: 8, brickHeight: 4, mortarWidth: 1, stagger: true, variation: .12 }) }),
  z.strictObject({ ...common, type: z.literal("dither"), parameters: z.strictObject({
    density: z.number().min(0).max(.5).default(.25), scale: z.number().int().min(1).max(4).default(1),
  }).default({ density: .25, scale: 1 }) }),
]).meta({ id: "pixelforge-material" });
export type Material = z.infer<typeof materialSchema>;
const coordinate = z.number().int().min(0).max(1023);
export const surfaceRunSchema = z.strictObject({ x: coordinate, y: coordinate, length: z.number().int().min(1).max(1024) });
export const surfaceEntrySchema = z.strictObject({ id, frame: id, layer: id,
  runs: z.array(surfaceRunSchema).max(8192), protected: z.array(surfaceRunSchema).max(8192).default([]),
});
export const surfaceMaskSchema = z.strictObject({ format: z.literal("pixelforge-surface-mask"), version: z.literal("1.0"), id,
  source: z.strictObject({ width: z.number().int().min(1).max(1024), height: z.number().int().min(1).max(1024), fingerprint: z.string().regex(/^[0-9a-f]{16}$/) }),
  surfaces: z.array(surfaceEntrySchema).min(1).max(64),
}).meta({ id: "pixelforge-surface-mask" });
export type SurfaceMask = z.infer<typeof surfaceMaskSchema>;
export type SurfaceEntry = z.infer<typeof surfaceEntrySchema>;
const rectangle = z.strictObject({ x: coordinate, y: coordinate, width: z.number().int().min(1).max(1024), height: z.number().int().min(1).max(1024) });
export const surfaceRegionsSchema = z.strictObject({ format: z.literal("pixelforge-surface-regions"), version: z.literal("1.0"), id, surfaces: z.array(z.strictObject({ id, frame: id, layer: id,
  regions: z.array(rectangle).min(1).max(64), protected: z.array(rectangle).max(64).default([]),
})).min(1).max(64) }).meta({ id: "pixelforge-surface-regions" });
export const materialCapabilities = {
  introducedIn: "0.9.0", types: ["wood", "metal", "plaster", "brick", "dither"],
  schemas: ["material", "surfaceMask", "surfaceRegions"],
  mask: "material mask SPRITE --parts SHAPE_IDS --out MASK.json; or --regions REGIONS.json for explicit authored ownership",
  apply: "material apply REQUEST --sprite SPRITE --mask MASK --surfaces IDS [--out VARIANT] [--operations-out OPS] --json",
  outputs: ["sprite 1.0", "operations 1.0", "source/material/mask provenance and diagnostics"],
  determinism: "32-bit seed and coordinate hashes; mask traversal order does not affect pixels; no ambient RNG",
  protection: "Explicit per-frame/layer run masks with protected runs; layout fingerprint binds dimensions, visibility, IDs and pixel indices. Palette-only recoloring is permitted.",
  limits: { maskPixels: 100000, surfaces: 64, sourcePixelsPerPlane: 1048576 },
  limitations: ["Generated prop masks require untouched prop pixel layout; select named solid surface parts",
    "Custom regions require authored ownership/protected structure; no automatic segmentation or color guessing",
    "Apply each finish to the original source; fingerprints reject stale or already textured layout", "Palette quality and directional projection remain artist choices; no lighting simulation"],
};
