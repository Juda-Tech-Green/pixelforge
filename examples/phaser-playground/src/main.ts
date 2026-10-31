import Phaser from "phaser";
import manifestInput from "../public/assets/atlas/bundle.json" with { type: "json" };
import sheetManifestInput from "../public/assets/spritesheet/bundle.json" with { type: "json" };
import { bundleManifestSchema } from "@pixelforge/core";
import {
  loadPixelForgeAssets,
  readPixelForgeMetadata,
  registerPixelForgeAnimations,
  createPixelForgeCharacter,
  getActiveHitboxes,
  currentAnimationEntry,
  playPixelForgeAnimation,
  observePixelForgeEvents,
  type GameAsset,
  type AnimationMetadata,
} from "@pixelforge/phaser";
export class Playground extends Phaser.Scene {
  player!: Phaser.Physics.Arcade.Sprite;
  target!: Phaser.GameObjects.Rectangle;
  debug!: Phaser.GameObjects.Graphics;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  animationKeys: Record<string, string> = {};
  asset!: GameAsset;
  animations!: AnimationMetadata;
  current = "idle";
  attacking = false;
  hits = 0;
  debugEnabled = true;
  lastEvent = "none";
  private hitThisAttack = false;
  constructor() {
    super("playground");
  }
  preload(): void {
    const m = bundleManifestSchema.parse(manifestInput);
    loadPixelForgeAssets(this, {
      key: "knight",
      baseURL: "assets/atlas",
      manifest: m,
    });
    loadPixelForgeAssets(this, {
      key: "sheet-knight",
      baseURL: "assets/spritesheet",
      manifest: bundleManifestSchema.parse(sheetManifestInput),
    });
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      document.querySelector("#status")!.textContent =
        `Asset load failed: ${file.key}`;
    });
  }
  create(): void {
    const data = readPixelForgeMetadata(this, "knight");
    this.asset = data.game;
    this.animations = data.animations;
    this.animationKeys = registerPixelForgeAnimations(this, {
      key: "knight",
      manifest: bundleManifestSchema.parse(manifestInput),
      ...data,
    });
    // Register twice to exercise duplicate-safe loading; another namespace can coexist.
    registerPixelForgeAnimations(this, {
      key: "knight",
      manifest: bundleManifestSchema.parse(manifestInput),
      ...data,
    });
    registerPixelForgeAnimations(this, {
      key: "sheet-knight",
      manifest: bundleManifestSchema.parse(sheetManifestInput),
      ...readPixelForgeMetadata(this, "sheet-knight"),
    });
    this.physics.world.setBounds(0, 0, 800, 440);
    const ground = this.add.rectangle(400, 420, 800, 40, 0x4a6040);
    this.physics.add.existing(ground, true);
    const platform = this.add.rectangle(440, 320, 140, 20, 0x52626d);
    this.physics.add.existing(platform, true);
    this.player = createPixelForgeCharacter(this, {
      key: "knight",
      game: this.asset,
      x: 150,
      y: 390,
      layout: "atlas",
    })
      .setScale(2)
      .setCollideWorldBounds(true);
    this.physics.add.collider(this.player, ground);
    this.physics.add.collider(this.player, platform);
    this.target = this.add.rectangle(280, 375, 24, 50, 0xbc765a);
    this.add.text(245, 333, "Practice target", {
      fontSize: "12px",
      color: "#e5e9ec",
    });
    this.debug = this.add.graphics().setDepth(10);
    this.keys = this.input.keyboard!.addKeys(
      "A,D,LEFT,RIGHT,SPACE,J,F3",
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    observePixelForgeEvents(
      this.player,
      this.asset,
      this.animationKeys,
      (e) => {
        this.lastEvent = e.name;
        if (e.name === "animation_complete" && e.animation === "attack")
          this.attacking = false;
      },
    );
    this.choose("idle");
  }
  private choose(name: string): void {
    this.current = name;
    playPixelForgeAnimation(this.player, this.animationKeys, name);
  }
  update(): void {
    if (!this.player) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (Phaser.Input.Keyboard.JustDown(this.keys.F3!))
      this.debugEnabled = !this.debugEnabled;
    const left = this.keys.A!.isDown || this.keys.LEFT!.isDown,
      right = this.keys.D!.isDown || this.keys.RIGHT!.isDown;
    this.player.setVelocityX(
      this.attacking ? 0 : left ? -130 : right ? 130 : 0,
    );
    if (left && !this.attacking) this.player.setFlipX(true);
    else if (right && !this.attacking) this.player.setFlipX(false);
    if (
      Phaser.Input.Keyboard.JustDown(this.keys.SPACE!) &&
      body.blocked.down &&
      !this.attacking
    )
      this.player.setVelocityY(-340);
    if (Phaser.Input.Keyboard.JustDown(this.keys.J!) && !this.attacking) {
      this.attacking = true;
      this.hitThisAttack = false;
      this.choose("attack");
    }
    if (!this.attacking)
      this.choose(
        !body.blocked.down ? "jump" : body.velocity.x !== 0 ? "walk" : "idle",
      );
    const boxes = getActiveHitboxes(this.player, this.asset, this.current),
      hurt = getActiveHitboxes(
        this.player,
        this.asset,
        this.current,
        "hurtbox",
      );
    if (
      this.attacking &&
      !this.hitThisAttack &&
      boxes.some((b) =>
        Phaser.Geom.Intersects.RectangleToRectangle(
          new Phaser.Geom.Rectangle(
            b.rect.x,
            b.rect.y,
            b.rect.width,
            b.rect.height,
          ),
          this.target.getBounds(),
        ),
      )
    ) {
      this.hits++;
      this.hitThisAttack = true;
      this.target.setFillStyle(0xb0db88);
      this.time.delayedCall(200, () => this.target.setFillStyle(0xbc765a));
    }
    this.debug.clear();
    if (this.debugEnabled) {
      this.debug
        .lineStyle(1, 0x77dd88)
        .strokeRect(body.x, body.y, body.width, body.height);
      for (const b of boxes)
        this.debug
          .lineStyle(2, 0xff6677)
          .strokeRect(b.rect.x, b.rect.y, b.rect.width, b.rect.height);
      for (const b of hurt)
        this.debug
          .lineStyle(1, 0x66bbff)
          .strokeRect(b.rect.x, b.rect.y, b.rect.width, b.rect.height);
    }
    const index = currentAnimationEntry(this.player),
      duration = this.animations.animations.find((a) => a.name === this.current)
        ?.frames[index]?.durationMs;
    document.querySelector("#status")!.textContent =
      `Animation: ${this.current} · entry ${index} · ${duration} ms\nEvent: ${this.lastEvent} · Valid hits: ${this.hits} · Debug: ${this.debugEnabled ? "on" : "off"}`;
  }
}
const runtime = globalThis as typeof globalThis & {pixelForgePlayground?: Phaser.Game};
export const game = runtime.pixelForgePlayground ??= new Phaser.Game({
  type: Phaser.CANVAS,
  width: 800,
  height: 440,
  parent: "game",
  pixelArt: true,
  backgroundColor: "#20262c",
  physics: {
    default: "arcade",
    arcade: { gravity: { x: 0, y: 800 }, debug: false },
  },
  audio: { noAudio: true },
  scene: Playground,
  banner: false,
});

export { applyPixelForgePhysics, getActiveHitboxes } from "@pixelforge/phaser";
