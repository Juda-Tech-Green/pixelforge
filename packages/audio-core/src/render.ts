import {
  parseSound,
  type SoundProject,
  type Voice,
  type Effect,
} from "./schema.js";
import {
  envelopeAt,
  frequencyAt,
  logarithmicTransfer,
  lowpass,
  noiseStream,
  nonlinearStep,
  oscillator,
} from "./dsp.js";

function checked(x: number, node: string): number {
  if (!Number.isFinite(x) || Math.abs(x) > 64)
    throw new Error(`${node}: non-finite or unstable amplitude (limit 64)`);
  return x;
}
function renderVoice(v: Voice, p: SoundProject, pcm: Float64Array): void {
  const rate = p.sampleRate,
    duration = p.durationMs / 1000;
  let phase = v.phase,
    re =
      "initialAmplitude" in v
        ? v.initialAmplitude * Math.cos(2 * Math.PI * phase)
        : 0;
  let im =
    "initialAmplitude" in v
      ? v.initialAmplitude * Math.sin(2 * Math.PI * phase)
      : 0;
  const random = noiseStream(p.seed, v.id);
  const filtered = lowpass(v.type === "noise" ? v.cutoffHz : 1000, rate);
  for (let n = 0; n < pcm.length; n++) {
    const t = n / rate;
    const hz = "frequency" in v ? frequencyAt(v.frequency, t / duration) : 0;
    let sample = 0;
    if (v.type === "oscillator") {
      const mod =
        1 -
        v.modulation.depth +
        (v.modulation.depth *
          (1 + Math.sin(2 * Math.PI * v.modulation.rateHz * t))) /
          2;
      sample = oscillator(v.waveform, phase, hz / rate, v.duty) * mod;
      phase = (phase + hz / rate) % 1;
    } else if (v.type === "noise") {
      const x = random();
      sample = v.color === "white" ? x : filtered(x);
    } else if (v.type === "damped") {
      sample = im;
      const angle = (2 * Math.PI * hz) / rate,
        decay = Math.exp(-v.decay / rate);
      const next = decay * (re * Math.cos(angle) - im * Math.sin(angle));
      im = decay * (re * Math.sin(angle) + im * Math.cos(angle));
      re = next;
    } else if (v.type === "nonlinear") {
      sample = im;
      // Bound phase advance and radial stiffness for RK4, never adaptive/unbounded.
      const omega = 2 * Math.PI * hz;
      const steps = Math.max(
        1,
        Math.ceil(
          (omega +
            Math.abs(v.sigma) +
            (Math.abs(v.cReal) + Math.abs(v.cImag)) * 64) /
            rate /
            0.2,
        ),
      );
      if (steps > 128) throw new Error(`${v.id}: RK4 substep budget exceeded`);
      for (let k = 0; k < steps; k++) {
        [re, im] = nonlinearStep(
          re,
          im,
          1 / rate / steps,
          v.sigma,
          omega,
          v.cReal,
          v.cImag,
        );
        checked(Math.hypot(re, im), v.id);
      }
    } else {
      for (const m of v.modes)
        sample +=
          m.gain *
          Math.exp(-m.decay * t) *
          Math.sin(2 * Math.PI * (m.frequencyHz * t + v.phase));
    }
    pcm[n] = checked(
      pcm[n]! +
        checked(sample, v.id) *
          v.gain *
          envelopeAt(v.envelope, t * 1000, p.durationMs),
      v.id,
    );
  }
}
function processEffect(e: Effect, p: SoundProject, pcm: Float64Array): void {
  if (e.type === "lowpass" || e.type === "highpass") {
    const filter = lowpass(e.cutoffHz, p.sampleRate);
    for (let i = 0; i < pcm.length; i++) {
      const x = pcm[i]!,
        y = filter(x);
      pcm[i] = e.type === "lowpass" ? y : x - y;
    }
  } else if (e.type === "delay") {
    const buffer = new Float64Array(
      Math.max(1, Math.round((e.delayMs * p.sampleRate) / 1000)),
    );
    for (let i = 0; i < pcm.length; i++) {
      const index = i % buffer.length,
        dry = pcm[i]!,
        delayed = buffer[index]!;
      buffer[index] = checked(dry + delayed * e.feedback, e.id);
      pcm[i] = dry * (1 - e.mix) + delayed * e.mix;
    }
  } else {
    const shape = (x: number): number => {
      switch (e.model) {
        case "tanh":
          return Math.tanh(x);
        case "hard":
          return Math.max(-1, Math.min(1, x));
        case "asymmetric":
          return Math.max(-e.negative, Math.min(e.positive, x));
        case "logarithmic":
          return logarithmicTransfer(x, e.coefficients);
      }
    };
    // Linear reconstruction plus two cascaded one-poles before decimation.
    // This reduces aliasing; it is not an ideal brick-wall reconstruction.
    const a = lowpass(p.sampleRate * 0.2, p.sampleRate * e.oversample);
    const b = lowpass(p.sampleRate * 0.2, p.sampleRate * e.oversample);
    let previous = 0;
    for (let i = 0; i < pcm.length; i++) {
      const dry = pcm[i]!;
      let wet = 0;
      for (let k = 1; k <= e.oversample; k++) {
        wet = shape(
          (previous + ((dry - previous) * k) / e.oversample) * e.inputGain,
        );
        if (e.oversample > 1) wet = b(a(wet));
      }
      pcm[i] = checked(dry * (1 - e.mix) + wet * e.outputGain * e.mix, e.id);
      previous = dry;
    }
  }
}
export interface AudioMetrics {
  peak: number;
  rms: number;
  clippedSamples: number;
  silent: boolean;
  samples: number;
}
export function renderSound(input: unknown): {
  pcm: Float64Array;
  metrics: AudioMetrics;
  project: SoundProject;
} {
  const project = parseSound(input);
  const pcm = new Float64Array(
    Math.round((project.durationMs * project.sampleRate) / 1000),
  );
  for (const voice of project.voices) renderVoice(voice, project, pcm);
  for (const effect of project.effects) processEffect(effect, project, pcm);
  let peak = 0,
    sum = 0,
    clippedSamples = 0;
  const fade = Math.min(
    Math.floor(pcm.length / 2),
    Math.round((project.output.fadeMs * project.sampleRate) / 1000),
  );
  for (let i = 0; i < pcm.length; i++) {
    let x = checked(pcm[i]! * project.output.gain, "output");
    if (fade > 0) x *= Math.min(1, i / fade, (pcm.length - 1 - i) / fade);
    if (Math.abs(x) > 1) {
      clippedSamples++;
      if (project.output.clipping === "error")
        throw new Error(`output: clipping at sample ${i}`);
      x = Math.max(-1, Math.min(1, x));
    }
    pcm[i] = x;
    peak = Math.max(peak, Math.abs(x));
    sum += x * x;
  }
  const rms = Math.sqrt(sum / pcm.length);
  return {
    pcm,
    project,
    metrics: {
      peak,
      rms,
      clippedSamples,
      silent: peak < 1e-8,
      samples: pcm.length,
    },
  };
}
