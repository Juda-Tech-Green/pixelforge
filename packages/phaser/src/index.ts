import type Phaser from "phaser";
import { z } from "zod";
import {
  animationMetadataSchema,
  bundleManifestSchema,
  gameAssetSchema,
  resolveGameBoxes,
  boxToWorld,
  type GameMetadata,
  validateBundleMetadata,
} from "@pixelforge/core";
export type BundleManifest = z.infer<typeof bundleManifestSchema>;
export type AnimationMetadata = z.infer<typeof animationMetadataSchema>;
export type GameAsset = z.infer<typeof gameAssetSchema>;
export const animationKey = (namespace: string, name: string): string =>
  `${encodeURIComponent(namespace)}:${encodeURIComponent(name)}`;
export function loadPixelForgeAssets(
  scene: Phaser.Scene,
  config: { key: string; baseURL: string; manifest: BundleManifest },
): void {
  const m = bundleManifestSchema.parse(config.manifest),
    url = (file: string) => `${config.baseURL.replace(/\/$/, "")}/${file}`;
  if (m.layout === "atlas") {
    if (!m.atlas) throw new Error("Atlas bundle is missing atlas filename");
    scene.load.atlas(config.key, url(m.texture), url(m.atlas));
  } else
    scene.load.spritesheet(config.key, url(m.texture), {
      frameWidth: m.frameWidth,
      frameHeight: m.frameHeight,
      spacing: m.padding,
      margin: 0,
      endFrame: m.frameCount - 1,
    });
  scene.load.json(`${config.key}:animations`, url(m.animations));
  scene.load.json(`${config.key}:game`, url(m.game));
}
export function readPixelForgeMetadata(scene: Phaser.Scene, key: string) {
  return {
    animations: animationMetadataSchema.parse(
      scene.cache.json.get(`${key}:animations`),
    ),
    game: gameAssetSchema.parse(scene.cache.json.get(`${key}:game`)),
  };
}
export function registerPixelForgeAnimations(
  scene: Phaser.Scene,
  config: {
    key: string;
    manifest: BundleManifest;
    animations: AnimationMetadata;
    game: GameAsset;
    namespace?: string;
  },
): Record<string, string> {
  const { animations, game } = validateBundleMetadata(
    config.manifest,
    config.animations,
    config.game,
  );
  const keys: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  for (const a of animations.animations) {
    const key = animationKey(config.namespace ?? config.key, a.name);
    keys[a.name] = key;
    if (scene.anims.exists(key)) continue;
    const base = Math.min(...a.frames.map((f) => f.durationMs));
    const frames = a.frames.map((f) => {
      const index = game.frameIds.indexOf(f.frameId);
      if (index < 0) throw new Error(`Unknown exported frame ${f.frameId}`);
      return {
        key: config.key,
        frame: config.manifest.layout === "atlas" ? f.frameId : index,
        duration: f.durationMs,
      };
    });
    scene.anims.create({
      key,
      frames,
      frameRate: 1000 / base,
      repeat: a.loop ? -1 : 0,
      skipMissedFrames: false,
    });
  }
  return keys;
}
export function applyPixelForgePhysics(
  sprite: Phaser.Physics.Arcade.Sprite,
  asset: GameAsset,
): void {
  const data = gameAssetSchema.parse(asset),
    body = sprite.body;
  if (!body || !("setSize" in body))
    throw new Error("An Arcade body is required");
  sprite.setOrigin(data.game.origin.x, data.game.origin.y);
  const b = data.game.body;
  if (!b) return;
  if (b.type === "rectangle") {
    body.setSize(b.width, b.height, false);
    body.setOffset(b.x, b.y);
  } else body.setCircle(b.radius, b.x, b.y);
}
export function createPixelForgeCharacter(
  scene: Phaser.Scene,
  config: {
    key: string;
    game: GameAsset;
    x: number;
    y: number;
    layout: "atlas" | "spritesheet";
  },
): Phaser.Physics.Arcade.Sprite {
  const sprite = scene.physics.add.sprite(
    config.x,
    config.y,
    config.key,
    config.layout === "atlas" ? config.game.frameIds[0] : 0,
  );
  applyPixelForgePhysics(sprite, config.game);
  return sprite;
}
export function currentAnimationEntry(
  sprite: Phaser.GameObjects.Sprite,
): number {
  return Math.max(0, (sprite.anims.currentFrame?.index ?? 1) - 1);
}
export function getActiveHitboxes(
  sprite: Phaser.GameObjects.Sprite,
  asset: GameAsset,
  animation: string,
  kind: "hitbox" | "hurtbox" = "hitbox",
) {
  const index = currentAnimationEntry(sprite),
    frame = sprite.frame.name;
  const frameId =
    typeof frame === "number" ? asset.frameIds[frame] : String(frame);
  return resolveGameBoxes(asset.game, frameId ?? "", animation, index)
    .filter((b) => b.kind === kind)
    .map((box) => ({
      id: box.id,
      name: box.name,
      rect: boxToWorld(box.rect, asset.width, asset.height, {
        x: sprite.x,
        y: sprite.y,
        originX: sprite.originX,
        originY: sprite.originY,
        scaleX: sprite.scaleX,
        scaleY: sprite.scaleY,
        flipX: sprite.flipX,
        flipY: sprite.flipY,
        rotation: sprite.rotation,
      }),
    }));
}
export function playPixelForgeAnimation(
  sprite: Phaser.GameObjects.Sprite,
  keys: Record<string, string>,
  name: string,
  restart = false,
): void {
  const key = keys[name];
  if (!key) throw new Error(`Unknown animation: ${name}`);
  sprite.play(key, !restart);
}
export interface GameEventNotice {
  id: string;
  name: string;
  animation: string;
  index: number;
  data?: GameMetadata["events"][number]["data"];
}
/** One observer per sprite: replaces any prior subscription and returns an idempotent disposer. */
const observers = new WeakMap<Phaser.GameObjects.Sprite, () => void>();
export function observePixelForgeEvents(
  sprite: Phaser.GameObjects.Sprite,
  asset: GameAsset,
  keys: Record<string, string>,
  callback: (event: GameEventNotice) => void,
): () => void {
  observers.get(sprite)?.();
  let last = "",
    cycle = 0,
    disposed = false;
  const reverse = new Map(
    Object.entries(keys).map(([name, key]) => [key, name]),
  );
  const emit = () => {
    const name = reverse.get(sprite.anims.currentAnim?.key ?? "");
    if (!name) return;
    const index = currentAnimationEntry(sprite),
      token = `${name}:${cycle}:${sprite.anims.repeatCounter}:${index}`;
    if (token === last) return;
    last = token;
    for (const event of asset.game.events)
      if (event.animation === name && event.index === index)
        callback({ ...event });
  };
  const start = () => {
      cycle++;
      last = "";
      emit();
    },
    repeat = () => emit(),
    complete = () => {
      const animation = reverse.get(sprite.anims.currentAnim?.key ?? "");
      if (animation)
        callback({
          id: "$complete",
          name: "animation_complete",
          animation,
          index: currentAnimationEntry(sprite),
        });
    };
  sprite.on("animationstart", start);
  sprite.on("animationupdate", emit);
  sprite.on("animationrepeat", repeat);
  sprite.on("animationcomplete", complete);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    sprite.off("animationstart", start);
    sprite.off("animationupdate", emit);
    sprite.off("animationrepeat", repeat);
    sprite.off("animationcomplete", complete);
    sprite.off("destroy", dispose);
    if (observers.get(sprite) === dispose) observers.delete(sprite);
  };
  sprite.once("destroy", dispose);
  observers.set(sprite, dispose);
  return dispose;
}
