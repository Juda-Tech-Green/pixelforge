import { it, expect } from "vitest";
import { EventEmitter } from "node:events";
import type Phaser from "phaser";
import * as pf from "../packages/core/src/index.js";
import {
  animationKey,
  observePixelForgeEvents,
  registerPixelForgeAnimations,
} from "../packages/phaser/src/index.js";
it("namespaces animation keys injectively and preserves exact durations and repeated source names", () => {
  expect(animationKey("hero:one", "walk")).not.toBe(
    animationKey("hero", "one:walk"),
  );
  const p = pf.createProject({ name: "Hero", width: 2, height: 2 });
  pf.addAnimation(
    p,
    "attack",
    [
      { frameId: "frame-0", durationMs: 90 },
      { frameId: "frame-0", durationMs: 210 },
    ],
    false,
  );
  const bundle = pf.assemblePhaserBundle(p),
    registered: Phaser.Types.Animations.Animation[] = [];
  const scene = {
    anims: {
      exists: () => false,
      create: (a: Phaser.Types.Animations.Animation) => registered.push(a),
    },
  } as unknown as Phaser.Scene;
  const keys = registerPixelForgeAnimations(scene, {
    key: "hero",
    manifest: bundle.manifest,
    game: bundle.gameData,
    animations: bundle.animationData,
  });
  expect(keys.attack).toBe("hero:attack");
  expect(registered[0]!.repeat).toBe(0);
  expect(registered[0]!.frameRate).toBeCloseTo(1000 / 90);
  expect(registered[0]!.frames).toEqual([
    { key: "hero", frame: "frame-0", duration: 90 },
    { key: "hero", frame: "frame-0", duration: 210 },
  ]);
});
it("deduplicates events, supports restart/loop boundaries and replaces old subscriptions", () => {
  const p = pf.createProject({ name: "Events", width: 2, height: 2 });
  pf.addAnimation(p, "attack", [{ frameId: "frame-0", durationMs: 100 }]);
  pf.setAnimationEvent(p, {
    id: "hit",
    name: "attack_start",
    animation: "attack",
    index: 0,
  });
  const data = pf.assemblePhaserBundle(p).gameData;
  const emitter = new EventEmitter(),
    state = {
      repeatCounter: 10,
      currentAnim: { key: "hero:attack" },
      currentFrame: { index: 1 },
    },
    sprite = Object.assign(emitter, {
      anims: state,
    }) as unknown as Phaser.GameObjects.Sprite;
  const seen: string[] = [];
  observePixelForgeEvents(sprite, data, { attack: "hero:attack" }, () =>
    seen.push("old"),
  );
  const dispose = observePixelForgeEvents(
    sprite,
    data,
    { attack: "hero:attack" },
    (e) => seen.push(e.name),
  );
  emitter.emit("animationstart");
  emitter.emit("animationupdate");
  emitter.emit("animationupdate");
  expect(seen).toEqual(["attack_start"]);
  state.repeatCounter--;
  emitter.emit("animationupdate"); // Phaser emits update before repeat.
  emitter.emit("animationrepeat");
  emitter.emit("animationupdate");
  emitter.emit("animationcomplete");
  expect(seen).toEqual(["attack_start", "attack_start", "animation_complete"]);
  dispose();
  dispose();
  emitter.emit("animationstart");
  expect(seen).toHaveLength(3);
});
