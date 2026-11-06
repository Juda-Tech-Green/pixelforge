import { z } from "zod";

const finite = (min: number, max: number) =>
  z.number().finite().min(min).max(max);
const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
export const frequencySchema = z.strictObject({
  startHz: finite(1, 20000),
  endHz: finite(1, 20000),
  curve: z.enum(["linear", "exponential"]).default("linear"),
});
export const envelopeSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("points"),
    points: z
      .array(z.strictObject({ timeMs: finite(0, 10000), value: finite(0, 1) }))
      .min(2)
      .max(64),
  }),
  z.strictObject({
    type: z.literal("adsr"),
    attackMs: finite(0, 10000),
    decayMs: finite(0, 10000),
    sustain: finite(0, 1),
    releaseMs: finite(0, 10000),
  }),
]);
const common = {
  id,
  gain: finite(0, 4).default(0.5),
  phase: finite(0, 1).default(0),
  envelope: envelopeSchema,
};
const modulation = z
  .strictObject({ rateHz: finite(0, 100), depth: finite(0, 1) })
  .default({ rateHz: 0, depth: 0 });
const mode = z.strictObject({
  frequencyHz: finite(1, 20000),
  decay: finite(0, 1000),
  gain: finite(0, 1),
});
export const voiceSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...common,
    type: z.literal("oscillator"),
    waveform: z.enum(["sine", "triangle", "sawtooth", "square", "pulse"]),
    frequency: frequencySchema,
    duty: finite(0.05, 0.95).default(0.5),
    modulation,
  }),
  z.strictObject({
    ...common,
    type: z.literal("noise"),
    color: z.enum(["white", "filtered"]).default("white"),
    cutoffHz: finite(10, 20000).default(3000),
  }),
  z.strictObject({
    ...common,
    type: z.literal("damped"),
    frequency: frequencySchema,
    decay: finite(0, 1000),
    initialAmplitude: finite(0, 4).default(1),
  }),
  z.strictObject({
    ...common,
    type: z.literal("nonlinear"),
    frequency: frequencySchema,
    sigma: finite(-1000, 100),
    cReal: finite(-1000, 0),
    cImag: finite(-1000, 1000),
    initialAmplitude: finite(0, 4).default(0.1),
  }),
  z.strictObject({
    ...common,
    type: z.literal("resonator"),
    modes: z.array(mode).min(1).max(16),
  }),
]);
const filter = { cutoffHz: finite(10, 20000) };
export const effectSchema = z.discriminatedUnion("type", [
  z.strictObject({ id, type: z.literal("lowpass"), ...filter }),
  z.strictObject({ id, type: z.literal("highpass"), ...filter }),
  z.strictObject({
    id,
    type: z.literal("delay"),
    delayMs: finite(0.1, 2000),
    feedback: finite(-0.95, 0.95),
    mix: finite(0, 1),
  }),
  z.strictObject({
    id,
    type: z.literal("distortion"),
    model: z.enum(["tanh", "hard", "asymmetric", "logarithmic"]),
    inputGain: finite(0, 16).default(1),
    outputGain: finite(0, 4).default(1),
    mix: finite(0, 1).default(1),
    positive: finite(0.01, 4).default(1),
    negative: finite(0.01, 4).default(1),
    coefficients: z
      .tuple([
        finite(0, 4),
        finite(0.001, 4),
        finite(0, 4),
        finite(0, 4),
        finite(0.001, 4),
        finite(0, 4),
      ])
      .default([1, 1, 0, 1, 1, 0]),
    oversample: z.union([z.literal(1), z.literal(4)]).default(4),
  }),
]);
export const soundSchema = z
  .strictObject({
    version: z.literal("1.0"),
    id,
    name: z.string().min(1).max(128),
    sampleRate: z
      .union([z.literal(22050), z.literal(44100), z.literal(48000)])
      .default(44100),
    durationMs: finite(1, 10000),
    seed: z.number().int().min(0).max(4294967295),
    prng: z.literal("xorshift32-v1").default("xorshift32-v1"),
    voices: z.array(voiceSchema).min(1).max(32),
    effects: z.array(effectSchema).max(16).default([]),
    output: z
      .strictObject({
        gain: finite(0, 4).default(1),
        clipping: z.enum(["error", "hard"]).default("error"),
        fadeMs: finite(0, 20).default(2),
      })
      .default({ gain: 1, clipping: "error", fadeMs: 2 }),
    export: z
      .strictObject({ format: z.literal("wav-pcm16"), key: id })
      .optional(),
    metadata: z
      .record(z.string().max(64), z.string().max(1024))
      .refine((x) => Object.keys(x).length <= 32)
      .optional(),
  })
  .superRefine((p, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const ids = [...p.voices, ...p.effects].map((v) => v.id);
    if (new Set(ids).size !== ids.length)
      fail("Voice and effect IDs must be unique");
    for (const v of p.voices) {
      if (
        "frequency" in v &&
        Math.max(v.frequency.startHz, v.frequency.endHz) >= p.sampleRate * 0.45
      )
        fail(`${v.id}: frequency must be below 0.45 * sampleRate`);
      if (
        v.type === "resonator" &&
        v.modes.some((m) => m.frequencyHz >= p.sampleRate * 0.45)
      )
        fail(`${v.id}: mode exceeds frequency limit`);
      if (v.type === "noise" && v.cutoffHz >= p.sampleRate / 2)
        fail(`${v.id}: cutoff exceeds Nyquist`);
      if (v.envelope.type === "points") {
        const points = v.envelope.points;
        if (points[0]!.timeMs !== 0)
          fail(`${v.id}: envelope must begin at zero time`);
        if (
          points.some(
            (a, i) =>
              a.timeMs > p.durationMs ||
              (i > 0 && a.timeMs <= points[i - 1]!.timeMs),
          )
        )
          fail(`${v.id}: envelope times must increase within duration`);
      } else if (
        v.envelope.attackMs + v.envelope.decayMs + v.envelope.releaseMs >
        p.durationMs
      )
        fail(`${v.id}: ADSR exceeds duration`);
    }
    for (const e of p.effects)
      if ("cutoffHz" in e && e.cutoffHz >= p.sampleRate / 2)
        fail(`${e.id}: cutoff exceeds Nyquist`);
    const samples = Math.round((p.durationMs * p.sampleRate) / 1000);
    const voiceCost = p.voices.reduce(
      (sum, v) =>
        sum +
        (v.type === "nonlinear"
          ? 4 *
            Math.max(
              1,
              Math.ceil(
                (2 *
                  Math.PI *
                  Math.max(v.frequency.startHz, v.frequency.endHz) +
                  Math.abs(v.sigma) +
                  (Math.abs(v.cReal) + Math.abs(v.cImag)) * 64) /
                  p.sampleRate /
                  0.2,
              ),
            )
          : v.type === "resonator"
            ? v.modes.length
            : 1),
      0,
    );
    const effectCost = p.effects.reduce(
      (sum, e) => sum + (e.type === "distortion" ? e.oversample * 4 : 1),
      0,
    );
    if (samples * (voiceCost + effectCost) > 40_000_000)
      fail("Render work exceeds 40 million work units");
  });
export type SoundProject = z.infer<typeof soundSchema>;
export type Voice = z.infer<typeof voiceSchema>;
export type Effect = z.infer<typeof effectSchema>;
export type Envelope = z.infer<typeof envelopeSchema>;
export type Frequency = z.infer<typeof frequencySchema>;
export function parseSound(input: unknown): SoundProject {
  return soundSchema.parse(input);
}
export function serializeSound(input: SoundProject): string {
  return JSON.stringify(parseSound(input), null, 2) + "\n";
}
