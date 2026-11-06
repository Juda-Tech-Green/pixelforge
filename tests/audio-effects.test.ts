import { expect, it } from "vitest";
import { createSound, renderSound, type Effect } from "@pixelforge/audio-core";
function sine() {
  const p = createSound("effect-analysis");
  p.effects = [];
  p.durationMs = 1000;
  p.output.fadeMs = 0;
  p.voices = [
    {
      id: "carrier",
      type: "oscillator",
      waveform: "sine",
      phase: 0,
      duty: 0.5,
      modulation: { rateHz: 0, depth: 0 },
      frequency: { startHz: 100, endHz: 100, curve: "linear" },
      gain: 0.25,
      envelope: {
        type: "points",
        points: [
          { timeMs: 0, value: 1 },
          { timeMs: 1000, value: 1 },
        ],
      },
    },
  ];
  return p;
}
function distortion(
  model: "tanh" | "hard" | "asymmetric" | "logarithmic",
): Effect {
  return {
    id: "shape",
    type: "distortion",
    model,
    inputGain: 1,
    outputGain: 1,
    mix: 1,
    positive: 0.1,
    negative: 0.2,
    coefficients: [1, 1, 0, 1, 1, 0],
    oversample: 1,
  };
}
it("applies symmetric and asymmetric transfer functions with distinct limits", () => {
  const p = sine(),
    dry = renderSound(p).pcm;
  for (const model of ["tanh", "hard", "asymmetric", "logarithmic"] as const) {
    p.effects = [distortion(model)];
    const { pcm } = renderSound(p);
    for (const n of [10, 90, 270, 500]) {
      const x = dry[n]!;
      const expected =
        model === "tanh"
          ? Math.tanh(x)
          : model === "hard"
            ? x
            : model === "asymmetric"
              ? Math.max(-0.2, Math.min(0.1, x))
              : Math.sign(x) * Math.log1p(Math.abs(x));
      expect(pcm[n]).toBeCloseTo(expected, 12);
    }
  }
});
it("highpass rejects DC/low frequencies and lowpass attenuates high frequency", () => {
  const p = sine();
  const clean = renderSound(p).metrics.rms;
  p.effects = [{ id: "high", type: "highpass", cutoffHz: 3000 }];
  expect(renderSound(p).metrics.rms).toBeLessThan(clean * 0.05);
  const v = p.voices[0]!;
  if (v.type !== "oscillator") throw new Error("fixture");
  v.frequency = { startHz: 5000, endHz: 5000, curve: "linear" };
  p.effects = [{ id: "low", type: "lowpass", cutoffHz: 200 }];
  expect(renderSound(p).metrics.rms).toBeLessThan(clean * 0.05);
});
it("delay has exact sample placement and bounded feedback", () => {
  const p = sine(),
    dry = renderSound(p).pcm;
  p.effects = [
    { id: "echo", type: "delay", delayMs: 10, feedback: 0.5, mix: 1 },
  ];
  const { pcm } = renderSound(p),
    delay = 441;
  expect(pcm.slice(0, delay)).toEqual(new Float64Array(delay));
  for (const n of [10, 50, 100]) {
    expect(pcm[delay + n]).toBe(dry[n]);
    expect(pcm[2 * delay + n]).toBeCloseTo(dry[delay + n]! + dry[n]! * 0.5, 12);
  }
});
it("supports all sample rates and preserves explicit zero wet mix", () => {
  for (const rate of [22050, 44100, 48000] as const) {
    const p = sine();
    p.sampleRate = rate;
    const dry = renderSound(p);
    p.effects = [{ ...distortion("tanh"), mix: 0, oversample: 4 } as Effect];
    expect(renderSound(p).pcm).toEqual(dry.pcm);
    expect(dry.pcm.length).toBe(rate);
  }
});
it("nonlinear damping settles toward the analytically predicted stable amplitude", () => {
  const p = sine();
  p.durationMs = 3000;
  p.voices = [
    {
      id: "limit-cycle",
      type: "nonlinear",
      gain: 0.5,
      phase: 0,
      envelope: {
        type: "points",
        points: [
          { timeMs: 0, value: 1 },
          { timeMs: 3000, value: 1 },
        ],
      },
      frequency: { startHz: 100, endHz: 100, curve: "linear" },
      sigma: 4,
      cReal: -8,
      cImag: 0,
      initialAmplitude: 0.1,
    },
  ];
  const { pcm } = renderSound(p);
  // dr/dt=4r-8r^2 has stable radius .5. Gain .5 -> peak .25.
  let peak = 0;
  for (let n = pcm.length - 4410; n < pcm.length; n++)
    peak = Math.max(peak, Math.abs(pcm[n]!));
  expect(peak).toBeCloseTo(0.25, 4);
});
