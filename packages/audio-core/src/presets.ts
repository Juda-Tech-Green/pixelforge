import { parseSound, type SoundProject } from "./schema.js";

export const audioPresetNames = [
  "laser-shot",
  "gunshot",
  "zombie-growl",
  "metal-impact",
  "altar-activation",
] as const;
export type AudioPresetName = (typeof audioPresetNames)[number];
export function createSound(
  name: string,
  preset: AudioPresetName = "laser-shot",
): SoundProject {
  const durationMs =
    preset === "altar-activation"
      ? 2400
      : preset === "zombie-growl"
        ? 1400
        : preset === "metal-impact"
          ? 1200
          : 400;
  const envelope = {
    type: "points",
    points: [
      { timeMs: 0, value: 0 },
      { timeMs: 4, value: 1 },
      { timeMs: durationMs - 30, value: 0 },
      { timeMs: durationMs, value: 0 },
    ],
  };
  const base = { id: "main", gain: 0.35, envelope };
  let voices: unknown[] = [],
    effects: unknown[] = [];
  switch (preset) {
    case "laser-shot":
      voices = [
        {
          ...base,
          type: "oscillator",
          waveform: "sawtooth",
          frequency: { startHz: 900, endHz: 120, curve: "exponential" },
        },
      ];
      effects = [
        { id: "tone", type: "lowpass", cutoffHz: 3200 },
        { id: "echo", type: "delay", delayMs: 75, feedback: 0.15, mix: 0.16 },
      ];
      break;
    case "gunshot":
      voices = [
        {
          ...base,
          type: "noise",
          color: "filtered",
          cutoffHz: 6000,
          envelope: {
            type: "points",
            points: [
              { timeMs: 0, value: 0 },
              { timeMs: 1, value: 1 },
              { timeMs: 130, value: 0 },
            ],
          },
        },
        {
          ...base,
          id: "body",
          type: "damped",
          frequency: { startHz: 100, endHz: 45 },
          decay: 24,
        },
      ];
      break;
    case "zombie-growl":
      voices = [
        {
          ...base,
          type: "nonlinear",
          frequency: { startHz: 65, endHz: 42 },
          sigma: 1,
          cReal: -4,
          cImag: 80,
          initialAmplitude: 0.6,
        },
        {
          ...base,
          id: "throat",
          type: "oscillator",
          waveform: "pulse",
          frequency: { startHz: 91, endHz: 62 },
          modulation: { rateHz: 13, depth: 0.8 },
          gain: 0.12,
        },
      ];
      effects = [
        {
          id: "grit",
          type: "distortion",
          model: "tanh",
          inputGain: 3,
          outputGain: 0.7,
        },
        { id: "dark", type: "lowpass", cutoffHz: 1800 },
      ];
      break;
    case "metal-impact":
      voices = [
        {
          ...base,
          type: "resonator",
          modes: [
            { frequencyHz: 440, decay: 5, gain: 0.7 },
            { frequencyHz: 1193, decay: 7, gain: 0.4 },
            { frequencyHz: 2371, decay: 11, gain: 0.25 },
            { frequencyHz: 3599, decay: 16, gain: 0.15 },
          ],
        },
      ];
      break;
    case "altar-activation":
      voices = [220, 330, 441].map((hz, i) => ({
        ...base,
        id: `layer${i}`,
        gain: 0.15,
        type: "oscillator",
        waveform: "sine",
        frequency: { startHz: hz, endHz: hz * 1.5, curve: "exponential" },
        modulation: { rateHz: 3 + i, depth: 0.4 },
        envelope: {
          type: "adsr",
          attackMs: 700,
          decayMs: 300,
          sustain: 0.7,
          releaseMs: 800,
        },
      }));
      effects = [
        { id: "space", type: "delay", delayMs: 160, feedback: 0.4, mix: 0.25 },
      ];
      break;
  }
  return parseSound({
    version: "1.0",
    id: preset,
    name,
    durationMs,
    seed: 9382,
    voices,
    effects,
    export: { format: "wav-pcm16", key: preset },
  });
}
