import Phaser from "phaser";
import manifest from "../coin/coin.json" with { type: "json" };

export class CoinScene extends Phaser.Scene {
  constructor() {
    super("coin-preview");
  }
  preload(): void {
    this.load.spritesheet(
      "coin",
      `${import.meta.env.BASE_URL}examples/coin.png`,
      {
        frameWidth: manifest.frameWidth,
        frameHeight: manifest.frameHeight,
        margin: manifest.margin,
        spacing: manifest.padding,
        endFrame: manifest.frames.length - 1,
      },
    );
  }
  create(): void {
    for (const animation of manifest.animations) {
      // Phaser 3.90 uses nonzero per-frame duration as an override.
      const baseMs = Math.min(...animation.frames.map((f) => f.durationMs));
      this.anims.create({
        key: animation.name,
        frames: animation.frames.map((f) => ({
          key: "coin",
          frame: f.index,
          duration: f.durationMs,
        })),
        frameRate: 1000 / baseMs,
        repeat: animation.loop ? -1 : 0,
      });
    }
    this.add.sprite(160, 120, "coin").setScale(8).play("spin");
    const status = document.querySelector("#status");
    if (status)
      status.textContent = `Loaded ${this.textures.get("coin").frameTotal - 1} frames · 16 × 16 · spin at 8 FPS`;
  }
}

export const game = new Phaser.Game({
  type: Phaser.CANVAS,
  width: 320,
  height: 240,
  parent: "game",
  backgroundColor: "#20262c",
  pixelArt: true,
  scene: CoinScene,
  audio: { noAudio: true },
  banner: false,
});
