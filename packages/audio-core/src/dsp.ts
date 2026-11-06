import type { Envelope, Frequency } from "./schema.js";

export function frequencyAt(f: Frequency, t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return f.curve === "linear"
    ? f.startHz + (f.endHz - f.startHz) * u
    : f.startHz * (f.endHz / f.startHz) ** u;
}
export function envelopeAt(
  e: Envelope,
  timeMs: number,
  durationMs: number,
): number {
  if (timeMs < 0 || timeMs >= durationMs) return 0;
  const points =
    e.type === "points"
      ? e.points
      : [
          { timeMs: 0, value: e.attackMs === 0 ? 1 : 0 },
          { timeMs: e.attackMs, value: 1 },
          { timeMs: e.attackMs + e.decayMs, value: e.sustain },
          { timeMs: durationMs - e.releaseMs, value: e.sustain },
          { timeMs: durationMs, value: 0 },
        ];
  // Right-continuous at coincident ADSR boundaries.
  let previous = points[0]!;
  for (let i = 1; i < points.length; i++) {
    const next = points[i]!;
    if (timeMs < next.timeMs)
      return (
        previous.value +
        ((next.value - previous.value) * (timeMs - previous.timeMs)) /
          (next.timeMs - previous.timeMs)
      );
    previous = next;
  }
  return previous.value;
}
export function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}
export function oscillator(
  wave: string,
  phase: number,
  dt: number,
  duty = 0.5,
): number {
  const t = phase - Math.floor(phase);
  switch (wave) {
    case "sine":
      return Math.sin(2 * Math.PI * t);
    case "triangle":
      return 1 - 4 * Math.abs(t - 0.5);
    case "sawtooth":
      return 2 * t - 1 - polyBlep(t, dt);
    case "square":
      duty = 0.5; // falls through
    case "pulse":
      return (
        (t < duty ? 1 : -1) + polyBlep(t, dt) - polyBlep((t - duty + 1) % 1, dt)
      );
    default:
      throw new Error(`Unknown waveform ${wave}`);
  }
}
export function noiseStream(seed: number, voiceId: string): () => number {
  let state = (seed ^ 2166136261) >>> 0;
  for (let i = 0; i < voiceId.length; i++)
    state = Math.imul(state ^ voiceId.charCodeAt(i), 16777619) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 2147483648 - 1;
  };
}
export function logarithmicTransfer(
  x: number,
  coefficients: readonly number[],
): number {
  const [a, b, c, d, e, f] = coefficients as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return x >= 0
    ? a * Math.log1p(x / b) + c * x
    : -d * Math.log1p(-x / e) + f * x;
}
export function lowpass(cutoff: number, rate: number): (x: number) => number {
  const a = -Math.expm1((-2 * Math.PI * cutoff) / rate);
  let y = 0;
  return (x) => (y += a * (x - y));
}
export function nonlinearStep(
  re: number,
  im: number,
  dt: number,
  sigma: number,
  omega: number,
  cr: number,
  ci: number,
): [number, number] {
  const derivative = (x: number, y: number): [number, number] => {
    const radius = Math.hypot(x, y),
      a = sigma + cr * radius,
      b = omega + ci * radius;
    return [a * x - b * y, b * x + a * y];
  };
  const a = derivative(re, im);
  const b = derivative(re + (dt * a[0]) / 2, im + (dt * a[1]) / 2);
  const c = derivative(re + (dt * b[0]) / 2, im + (dt * b[1]) / 2);
  const d = derivative(re + dt * c[0], im + dt * c[1]);
  return [
    re + (dt * (a[0] + 2 * b[0] + 2 * c[0] + d[0])) / 6,
    im + (dt * (a[1] + 2 * b[1] + 2 * c[1] + d[1])) / 6,
  ];
}
