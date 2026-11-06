import { expect, it } from "vitest";
import {
  createSound,
  oscillator,
  parseSound,
  renderSound,
  type Voice,
} from "@pixelforge/audio-core";

function single(voice: Voice) {
  const p = createSound("analysis");
  p.durationMs = 1000;
  p.effects = [];
  p.voices = [voice];
  p.output.fadeMs = 0;
  return p;
}
const envelope = {
  type: "points" as const,
  points: [
    { timeMs: 0, value: 1 },
    { timeMs: 1000, value: 1 },
  ],
};
it("linear ODE agrees with an independent analytic damped sine", () => {
  const p = single({
    id: "ode",
    type: "damped",
    gain: 0.5,
    phase: 0.125,
    envelope,
    frequency: { startHz: 440, endHz: 440, curve: "linear" },
    decay: 3,
    initialAmplitude: 1,
  });
  const { pcm } = renderSound(p);
  for (const n of [0, 100, 1000, 10000, 44099])
    expect(pcm[n]).toBeCloseTo(
      0.5 *
        Math.exp((-3 * n) / 44100) *
        Math.sin(2 * Math.PI * ((440 * n) / 44100 + 0.125)),
      11,
    );
});
it("resonator partials equal independent closed-form modal synthesis", () => {
  const modes = [
    { frequencyHz: 440, decay: 3, gain: 0.5 },
    { frequencyHz: 719, decay: 5, gain: 0.2 },
  ];
  const p = single({
    id: "bell",
    type: "resonator",
    gain: 0.5,
    phase: 0,
    envelope,
    modes,
  });
  const { pcm } = renderSound(p);
  for (const n of [0, 99, 1009, 30000])
    expect(pcm[n]).toBeCloseTo(
      modes.reduce(
        (sum, m) =>
          sum +
          0.5 *
            m.gain *
            Math.exp((-m.decay * n) / 44100) *
            Math.sin((2 * Math.PI * m.frequencyHz * n) / 44100),
        0,
      ),
      12,
    );
});
it("frequency sweep phase stays continuous across many cycles", () => {
  const p = single({
    id: "sweep",
    type: "oscillator",
    gain: 0.5,
    phase: 0,
    envelope,
    waveform: "sine",
    duty: 0.5,
    modulation: { rateHz: 0, depth: 0 },
    frequency: { startHz: 100, endHz: 1000, curve: "linear" },
  });
  const { pcm } = renderSound(p);
  for (const n of [100, 1000, 10000, 40000]) {
    // Left-endpoint discrete integration, independently summed in closed form.
    const cycles = (100 * n + ((900 / 44100) * n * (n - 1)) / 2) / 44100;
    expect(pcm[n]).toBeCloseTo(0.5 * Math.sin(2 * Math.PI * cycles), 10);
  }
});
it("inserting a silent independent noise voice leaves existing samples identical", () => {
  const p = single({
    id: "noise",
    type: "noise",
    color: "white",
    cutoffHz: 1000,
    gain: 0.5,
    phase: 0,
    envelope,
  });
  const before = renderSound(p).pcm;
  p.voices.unshift({ ...p.voices[0]!, id: "other", gain: 0 });
  expect(renderSound(p).pcm).toEqual(before);
});
it("PolyBLEP reduces off-harmonic alias energy for a high-pitched saw", () => {
  const length = 1024,
    bin = 181,
    dt = bin / length;
  const spectrumEnergy = (blep: boolean) => {
    let total = 0;
    const expected = new Set([bin, 2 * bin]);
    for (let k = 1; k < length / 2; k++) {
      if (expected.has(k)) continue;
      let re = 0,
        im = 0;
      for (let n = 0; n < length; n++) {
        const t = (n * dt) % 1,
          x = blep ? oscillator("sawtooth", t, dt) : 2 * t - 1;
        re += x * Math.cos((2 * Math.PI * k * n) / length);
        im -= x * Math.sin((2 * Math.PI * k * n) / length);
      }
      total += re * re + im * im;
    }
    return total;
  };
  expect(spectrumEnergy(true)).toBeLessThan(spectrumEnergy(false) * 0.2);
});
it("rejects expensive requests and identifies unstable nonlinear state", () => {
  const p = createSound("stress", "zombie-growl");
  p.voices = Array.from({ length: 32 }, (_, n) => ({
    ...p.voices[0]!,
    id: `voice${n}`,
  }));
  p.durationMs = 10000;
  expect(() => parseSound(p)).toThrow(/work exceeds/);
  const unstable = single({
    id: "unstable_model",
    type: "nonlinear",
    phase: 0,
    gain: 0.1,
    envelope,
    frequency: { startHz: 100, endHz: 100, curve: "linear" },
    sigma: 100,
    cReal: 0,
    cImag: 0,
    initialAmplitude: 4,
  });
  expect(() => renderSound(unstable)).toThrow(/unstable_model/);
});
it("duration rounds to the nearest sample and silence is reported", () => {
  const p = createSound("silent");
  p.durationMs = 400.01;
  p.voices[0]!.gain = 0;
  const r = renderSound(p);
  expect(r.metrics.samples).toBe(Math.round(400.01 * 44.1));
  expect(r.metrics.silent).toBe(true);
  expect(r.metrics.rms).toBe(0);
});
