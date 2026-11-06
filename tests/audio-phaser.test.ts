import { it, expect } from "vitest";
import type Phaser from "phaser";
import { assembleAudioBundle } from "@pixelforge/audio-exporters";
import { createSound, audioManifestSchema } from "@pixelforge/audio-core";
import {
  loadPixelForgeAudio,
  playPixelForgeSoundEvent,
} from "../packages/phaser/src/index.js";
it("queues stable WAV keys and maps existing sprite event notices", () => {
  const { manifest } = assembleAudioBundle(createSound("laser"), [
    { animation: "attack", event: "fire", sound: "laser-shot" },
  ]);
  const queued: unknown[] = [],
    played: string[] = [];
  const scene = {
    load: { audio: (...args: unknown[]) => queued.push(args) },
    sound: {
      play: (key: string) => {
        played.push(key);
        return true;
      },
    },
  } as unknown as Phaser.Scene;
  loadPixelForgeAudio(scene, { baseURL: "/assets/audio/", manifest });
  expect(queued).toEqual([["laser-shot", "/assets/audio/laser-shot.wav"]]);
  expect(
    playPixelForgeSoundEvent(scene, manifest, {
      id: "fire",
      name: "fire",
      animation: "attack",
      index: 0,
    }),
  ).toBe(1);
  expect(played).toEqual(["laser-shot"]);
  expect(
    playPixelForgeSoundEvent(scene, manifest, {
      id: "other",
      name: "other",
      animation: "attack",
      index: 0,
    }),
  ).toBe(0);
  expect(() =>
    audioManifestSchema.parse({
      ...manifest,
      assets: [{ ...manifest.assets[0], file: "../escape.wav" }],
    }),
  ).toThrow();
});
