import { z } from "zod";
import { colorSchema } from "@pixelforge/core";
import { geometryIdSchema } from "./rig-schema.js";
const id = geometryIdSchema;
const pixel = z.number().int().min(-4096).max(4096);
const point = z.tuple([pixel, pixel]);
export const roomLayers = ["architecture", "background-furniture", "furniture", "actors", "foreground"] as const;
export const roomAnchorNames = ["room.floor.left", "room.floor.center", "room.floor.right", "room.wall.left", "room.wall.center", "room.wall.right"] as const;
export const roomSchema = z.strictObject({
  format: z.literal("pixelforge-room"), version: z.literal("1.0"), id, name: z.string().min(1).max(128),
  canvas: z.strictObject({ width: z.number().int().min(1).max(512), height: z.number().int().min(2).max(512) }),
  palette: z.array(colorSchema).min(2).max(256).describe("Background palette; exact sprite colors are merged deterministically"),
  background: z.strictObject({ wallHeight: z.number().int().min(1).max(511),
    wallColor: z.number().int().min(1).max(255), floorColor: z.number().int().min(1).max(255),
    wallAsset: id.optional().describe("Already materialized wall sprite, exactly the wall-region size"),
    floorAsset: id.optional().describe("Already materialized floor sprite, exactly the floor-region size"),
  }),
  assets: z.record(id, z.strictObject({ source: z.string().min(1).max(1024), type: z.enum(["sprite", "prop"]).default("sprite"),
    frame: z.string().min(1).max(128).optional(), anchors: z.record(id, point).refine(a => Object.keys(a).length <= 32).default({}),
  })).refine(a => Object.keys(a).length <= 32),
  instances: z.array(z.strictObject({ id, asset: id, layer: z.enum(roomLayers), depth: z.number().int().min(-64).max(64).default(0),
    placement: z.union([
      z.strictObject({ anchor: z.string().min(1).max(192), align: id.default("origin"), offset: point.default([0, 0]) }),
      z.strictObject({ position: point.describe("Explicit top-left canvas position") }),
    ]),
    allowClipping: z.boolean().default(false),
    transform: z.strictObject({ scale: z.literal(1).optional(), rotation: z.literal(0).optional() }).optional(),
  })).max(64),
}).meta({ id: "pixelforge-room" });
export type Room = z.infer<typeof roomSchema>;
export type RoomLayer = typeof roomLayers[number];
export const roomCapabilities = {
  introducedIn: "0.9.0", schema: "capabilities --schema room", formatVersion: "1.0",
  anchors: roomAnchorNames, assetAnchors: ["origin", "center", "top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right", "declared prop anchors", "project/frame game anchors", "explicit asset anchors"],
  coordinates: "Integer canvas pixels: +X right, +Y down. Wall anchors at wall mid-height; floor anchors at floor-region mid-height. Left/right are canvas edge pixels.",
  placement: "topLeft = targetAnchor + offset - source align anchor; instance references use instanceId.anchorName; missing ground/surface anchors are never guessed",
  layers: roomLayers, ordering: "Dependencies resolve first, smallest available instance ID first; render layers then explicit depth then ID. No appearance-based depth inference.",
  assets: "Only explicitly declared paths relative to the room file; immutable sprite variants preferred. Explicit type:prop compiles once per asset per resolution, without materials.",
  resolve: "room resolve REQUEST [--out SCENE] [--sprite SPRITE] [--mapping-out JSON] [--resources-out JSON] --json",
  preview: "preview DERIVED.sprite.json --out room.png --json (existing renderer/exporter)",
  outputs: ["unchanged scene 1.0 manifest", "editable sprite 1.0 via existing scene renderer", "instance/source/anchor/provenance mappings", "explicit background surfaceRegions adapter"],
  limits: { instances: 64, assets: 32, anchorsPerAsset: 32, canvas: [512, 512], sceneColors: 256 },
  limitations: ["Static 2D translation only; no scale, rotation, flips, physics, automatic clutter or material regeneration",
    "One explicit frame per asset; ambiguous multi-frame assets need frame IDs", "Background image variants must exactly fit their region; no automatic tiling/scaling",
    "allowClipping must be explicit; overlaps are permitted", "Palette indices may be remapped to preserve exact composited RGBA; internal source layers remain in referenced source documents"],
};
