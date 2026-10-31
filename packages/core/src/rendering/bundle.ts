import { z } from "zod";
import { toDocument, type Project } from "../models/project.js";
import { getGameMetadata } from "../models/game.js";
import { gameMetadataSchema, gameMetadataErrors } from "../schema/game.js";
import { renderAtlas, type AtlasOptions } from "./atlas.js";
import { renderSpriteSheet, type SheetOptions } from "./sheet.js";
export const animationMetadataSchema = z.strictObject({
  version: z.literal("1.0"),
  animations: z.array(
    z.strictObject({
      name: z.string().min(1),
      loop: z.boolean(),
      frames: z
        .array(
          z.strictObject({
            frameId: z.string().min(1),
            durationMs: z.number().int().positive(),
          }),
        )
        .min(1),
    }),
  ),
});
export const gameAssetSchema = z.strictObject({
  version: z.literal("1.0"),
  width: z.number().int().positive().max(1024),
  height: z.number().int().positive().max(1024),
  frameIds: z.array(z.string().min(1)).min(1),
  game: gameMetadataSchema,
});
export const bundleManifestSchema = z.strictObject({
  format: z.literal("pixelforge-phaser"),
  version: z.literal("1.0"),
  layout: z.enum(["atlas", "spritesheet"]),
  texture: z.string(),
  atlas: z.string().optional(),
  animations: z.string(),
  game: z.string(),
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
  columns: z.number().int().positive().optional(),
  padding: z.number().int().nonnegative(),
  frameCount: z.number().int().positive(),
});
export interface BundleOptions extends AtlasOptions, SheetOptions {
  layout?: "atlas" | "spritesheet";
  name?: string;
  includeGame?: boolean;
  includeAnimations?: boolean;
}
export function validateBundleMetadata(
  manifestInput: unknown,
  animationInput: unknown,
  gameInput: unknown,
) {
  const manifest = bundleManifestSchema.parse(manifestInput),
    animations = animationMetadataSchema.parse(animationInput),
    game = gameAssetSchema.parse(gameInput);
  if (
    manifest.frameWidth !== game.width ||
    manifest.frameHeight !== game.height ||
    manifest.frameCount !== game.frameIds.length
  )
    throw new Error("Bundle dimensions/frame count disagree");
  if (new Set(game.frameIds).size !== game.frameIds.length)
    throw new Error("Duplicate exported frame IDs");
  if (
    new Set(animations.animations.map((a) => a.name)).size !==
    animations.animations.length
  )
    throw new Error("Duplicate animation names");
  for (const file of [
    manifest.texture,
    manifest.atlas,
    manifest.animations,
    manifest.game,
  ])
    if (file !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(file))
      throw new Error("Bundle filenames must be safe basenames");
  if (manifest.layout === "atlas" && !manifest.atlas)
    throw new Error("Atlas filename is required");
  for (const a of animations.animations)
    for (const f of a.frames)
      if (!game.frameIds.includes(f.frameId))
        throw new Error(`Unknown exported frame ${f.frameId}`);
  const errors = gameMetadataErrors(game.game, {
    width: game.width,
    height: game.height,
    frames: game.frameIds.map((id) => ({ id })),
    animations: animations.animations,
  });
  if (errors.length) throw new Error(errors.join("; "));
  return { manifest, animations, game };
}
export function assemblePhaserBundle(p: Project, options: BundleOptions = {}) {
  toDocument(p);
  const name = options.name ?? "character";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name))
    throw new Error(
      "Bundle name must be 1–64 filesystem-safe letters, digits, hyphens or underscores",
    );
  const layout = options.layout ?? "atlas";
  if (layout !== "atlas" && layout !== "spritesheet")
    throw new Error("Layout must be atlas or spritesheet");
  const sheet =
    layout === "spritesheet" ? renderSpriteSheet(p, options) : undefined;
  const atlas =
    layout === "atlas"
      ? renderAtlas(p, { ...options, image: `${name}.png` })
      : undefined;
  const raster = (atlas ?? sheet)!.raster;
  const manifest = bundleManifestSchema.parse({
    format: "pixelforge-phaser",
    version: "1.0",
    layout,
    texture: `${name}.png`,
    atlas: atlas ? `${name}.atlas.json` : undefined,
    animations: `${name}.animations.json`,
    game: `${name}.game.json`,
    frameWidth: p.width,
    frameHeight: p.height,
    columns: sheet?.manifest.columns,
    padding: options.padding ?? (atlas ? 1 : 0),
    frameCount: p.frames.length,
  });
  const animationData = animationMetadataSchema.parse({
    version: "1.0",
    animations: options.includeAnimations === false ? [] : p.animations,
  });
  const gameData = gameAssetSchema.parse({
    version: "1.0",
    width: p.width,
    height: p.height,
    frameIds: p.frames.map((f) => f.id),
    game:
      options.includeGame === false
        ? {
            version: "1.0",
            origin: { x: 0.5, y: 0.5 },
            boxes: [],
            anchors: [],
            events: [],
          }
        : getGameMetadata(p),
  });
  const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
  // When animations are intentionally excluded, entry-scoped metadata must be excluded too.
  if (options.includeAnimations === false) {
    gameData.game.events = [];
    gameData.game.boxes = gameData.game.boxes.filter(
      (b) => b.scope.type === "project" || b.scope.type === "frame",
    );
    gameData.game.anchors = gameData.game.anchors.filter(
      (a) => a.scope.type === "project" || a.scope.type === "frame",
    );
  }
  validateBundleMetadata(manifest, animationData, gameData);
  const files: Record<string, string> = {
    "bundle.json": json(manifest),
    [manifest.animations]: json(animationData),
    [manifest.game]: json(gameData),
    "README.md": `# ${name}\n\nLoad bundle.json with @pixelforge/phaser. ${atlas ? "The atlas JSON is native Phaser JSON Hash." : "The PNG uses fixed cells; padding is Phaser spacing, margin is zero."} Animation and game files use PixelForge schemas version 1.0. All coordinates refer to the untrimmed source canvas.\n`,
  };
  if (atlas) files[manifest.atlas!] = json(atlas.atlas);
  return {
    raster,
    manifest,
    animationData,
    gameData,
    files,
    unusedArea:
      raster.width * raster.height - p.frames.length * p.width * p.height,
  };
}
