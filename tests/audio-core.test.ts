import { describe, it, expect } from "vitest";
import {
  applyAudioOperations,
  audioPresetNames,
  createSound,
  envelopeAt,
  frequencyAt,
  logarithmicTransfer,
  lowpass,
  noiseStream,
  nonlinearStep,
  oscillator,
  parseSound,
  renderSound,
  serializeSound,
} from "@pixelforge/audio-core";
import { encodeWav } from "@pixelforge/audio-exporters";
import { spawnSync } from "node:child_process";

describe("procedural audio mathematical contract", () => {
  it("integrates a 440 Hz sine with the expected zero crossings", () => {
    const p = createSound("sine");
    p.durationMs = 1000;
    p.voices = [
      {
        ...p.voices[0]!,
        type: "oscillator",
        waveform: "sine",
        frequency: { startHz: 440, endHz: 440, curve: "linear" },
        gain: 0.5,
        phase: 0,
        duty: 0.5,
        modulation: { rateHz: 0, depth: 0 },
        envelope: {
          type: "points",
          points: [
            { timeMs: 0, value: 1 },
            { timeMs: 1000, value: 1 },
          ],
        },
      },
    ];
    p.effects = [];
    p.output.fadeMs = 0;
    const { pcm } = renderSound(p);
    let crossings = 0;
    for (let i = 1; i < pcm.length; i++)
      if (pcm[i - 1]! <= 0 && pcm[i]! > 0) crossings++;
    expect(crossings).toBe(440);
    expect(pcm[100]).toBeCloseTo(
      0.5 * Math.sin((2 * Math.PI * 440 * 100) / 44100),
      10,
    );
  });
  it("defines waveform signs, PolyBLEP boundaries and duty", () => {
    expect(oscillator("sine", 0.25, 0.01)).toBe(1);
    expect(oscillator("triangle", 0.5, 0.01)).toBe(1);
    expect(oscillator("sawtooth", 0, 0.01)).toBe(0);
    expect(oscillator("square", 0.25, 0.01)).toBe(1);
    expect(oscillator("pulse", 0.25, 0.01, 0.1)).toBe(-1);
  });
  it("defines linear and exponential frequency sweeps", () => {
    expect(
      frequencyAt({ startHz: 100, endHz: 400, curve: "linear" }, 0.5),
    ).toBe(250);
    expect(
      frequencyAt({ startHz: 100, endHz: 400, curve: "exponential" }, 0.5),
    ).toBe(200);
  });
  it("interpolates custom and zero-attack ADSR envelopes", () => {
    expect(
      envelopeAt(
        {
          type: "points",
          points: [
            { timeMs: 0, value: 0 },
            { timeMs: 100, value: 1 },
          ],
        },
        50,
        200,
      ),
    ).toBe(0.5);
    const e = {
      type: "adsr" as const,
      attackMs: 0,
      decayMs: 100,
      sustain: 0.5,
      releaseMs: 100,
    };
    expect(envelopeAt(e, 0, 400)).toBe(1);
    expect(envelopeAt(e, 350, 400)).toBe(0.25);
    expect(envelopeAt(e, 400, 400)).toBe(0);
  });
  it("matches the exact linear complex ODE with RK4", () => {
    let re = 1,
      im = 0;
    for (let n = 0; n < 1000; n++)
      [re, im] = nonlinearStep(re, im, 0.00001, -3, 2 * Math.PI * 100, 0, 0);
    expect(re).toBeCloseTo(Math.exp(-0.03), 8);
    expect(im).toBeCloseTo(0, 8);
  });
  it("implements both signs of paper B equation 33.8", () => {
    expect(logarithmicTransfer(2, [3, 4, 5, 6, 7, 8])).toBeCloseTo(
      3 * Math.log(1.5) + 10,
    );
    expect(logarithmicTransfer(-2, [3, 4, 5, 6, 7, 8])).toBeCloseTo(
      -6 * Math.log(1 + 2 / 7) - 16,
    );
    expect(logarithmicTransfer(0, [1, 1, 0, 1, 1, 0])).toBe(0);
  });
  it("keeps lowpass impulse response finite and conserves DC gain", () => {
    const filter = lowpass(1000, 44100);
    let sum = 0;
    for (let i = 0; i < 10000; i++) sum += filter(i === 0 ? 1 : 0);
    expect(sum).toBeCloseTo(1, 12);
  });
  it("uses repeatable independent voice random streams", () => {
    const a = noiseStream(1, "a"),
      b = noiseStream(1, "a"),
      other = noiseStream(1, "b"),
      changed = noiseStream(2, "a");
    const first = a();
    expect(b()).toBe(first);
    expect(other()).not.toBe(first);
    expect(changed()).not.toBe(first);
    for (let i = 0; i < 100; i++) {
      other();
      expect(a()).toBe(b());
    }
  });
});

describe("audio project integrity", () => {
  for (const preset of audioPresetNames)
    it(`renders deterministic audible ${preset} with smooth boundaries`, () => {
      const p = createSound(preset, preset),
        original = serializeSound(p);
      const a = renderSound(p),
        b = renderSound(p);
      expect(a.pcm).toEqual(b.pcm);
      expect(a.metrics.silent).toBe(false);
      expect(a.metrics.rms).toBeGreaterThan(0.001);
      expect(a.metrics.peak).toBeLessThanOrEqual(1);
      expect(a.pcm[0]).toBe(0);
      expect(a.pcm.at(-1)).toBe(0);
      expect(encodeWav(a.pcm, p.sampleRate)).toEqual(
        encodeWav(b.pcm, p.sampleRate),
      );
      expect(serializeSound(p)).toBe(original);
    });
  it("rejects schema versions, nonfinite values, unstable feedback and duplicate IDs", () => {
    const p = createSound("bad");
    expect(() => parseSound({ ...p, version: "2.0" })).toThrow();
    expect(() => parseSound({ ...p, durationMs: Infinity })).toThrow();
    expect(() =>
      parseSound({ ...p, voices: [...p.voices, ...p.voices] }),
    ).toThrow(/unique/);
    expect(() =>
      parseSound({
        ...p,
        effects: [
          { id: "bad", type: "delay", delayMs: 10, feedback: 1, mix: 1 },
        ],
      }),
    ).toThrow();
    expect(() => parseSound({ ...p, durationMs: 10001 })).toThrow();
    expect(() =>
      parseSound({
        ...p,
        voices: Array.from({ length: 33 }, (_, i) => ({
          ...p.voices[0],
          id: `voice${i}`,
        })),
      }),
    ).toThrow();
  });
  it("rejects invalid envelopes and frequencies", () => {
    const p = createSound("bad");
    expect(() =>
      parseSound({
        ...p,
        voices: [{ ...p.voices[0], frequency: { startHz: 22000, endHz: 100 } }],
      }),
    ).toThrow();
    expect(() =>
      parseSound({
        ...p,
        voices: [
          {
            ...p.voices[0],
            envelope: {
              type: "points",
              points: [
                { timeMs: 0, value: 0 },
                { timeMs: 0, value: 1 },
              ],
            },
          },
        ],
      }),
    ).toThrow(/increase/);
  });
  it("applies operations atomically and serializes consistently", () => {
    const p = createSound("ops"),
      original = serializeSound(p);
    expect(() =>
      applyAudioOperations(p, [
        { op: "setSeed", seed: 20 },
        { op: "removeVoice", id: "missing" },
      ]),
    ).toThrow();
    expect(serializeSound(p)).toBe(original);
    const ops = [
      { op: "setSeed", seed: 20 },
      { op: "setGain", id: "main", gain: 0.1 },
    ];
    expect(serializeSound(applyAudioOperations(p, ops))).toBe(
      serializeSound(applyAudioOperations(p, ops)),
    );
  });
  it("reports clipping and refuses invalid WAV samples", () => {
    const p = createSound("clip");
    p.voices[0]!.gain = 4;
    p.effects = [];
    expect(() => renderSound(p)).toThrow(/clipping/);
    p.output.clipping = "hard";
    expect(renderSound(p).metrics.clippedSamples).toBeGreaterThan(0);
    expect(() => encodeWav(new Float64Array([NaN]), 44100)).toThrow();
    expect(() => encodeWav(new Float64Array([2]), 44100)).toThrow();
  });
  it("produces WAV independently decoded by Python's standard wave module", () => {
    const wav = encodeWav(new Float64Array([-1, -0.5, 0, 0.5, 1]), 44100);
    const script =
      "import sys,io,wave,struct,json; w=wave.open(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps([w.getnchannels(),w.getsampwidth(),w.getframerate(),w.getnframes(),list(struct.unpack('<5h',w.readframes(5)))]))";
    const result = spawnSync("python", ["-c", script], {
      input: wav,
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      1,
      2,
      44100,
      5,
      [-32768, -16384, 0, 16384, 32767],
    ]);
  });
});
