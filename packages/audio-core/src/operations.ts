import { z } from "zod";
import {
  effectSchema,
  envelopeSchema,
  frequencySchema,
  parseSound,
  voiceSchema,
  type SoundProject,
} from "./schema.js";

export const audioOperationsSchema = z
  .array(
    z.discriminatedUnion("op", [
      z.strictObject({ op: z.literal("addVoice"), voice: voiceSchema }),
      z.strictObject({ op: z.literal("removeVoice"), id: z.string() }),
      z.strictObject({
        op: z.literal("setFrequency"),
        id: z.string(),
        frequency: frequencySchema,
      }),
      z.strictObject({
        op: z.literal("setEnvelope"),
        id: z.string(),
        envelope: envelopeSchema,
      }),
      z.strictObject({
        op: z.literal("setGain"),
        id: z.string(),
        gain: z.number().finite().min(0).max(4),
      }),
      z.strictObject({
        op: z.literal("setSeed"),
        seed: z.number().int().min(0).max(4294967295),
      }),
      z.strictObject({
        op: z.literal("setOde"),
        id: z.string(),
        sigma: z.number().finite(),
        cReal: z.number().finite(),
        cImag: z.number().finite(),
      }),
      z.strictObject({ op: z.literal("addEffect"), effect: effectSchema }),
      z.strictObject({ op: z.literal("removeEffect"), id: z.string() }),
    ]),
  )
  .min(1)
  .max(256);

export function applyAudioOperations(
  input: unknown,
  operations: unknown,
): SoundProject {
  const project = structuredClone(parseSound(input));
  for (const operation of audioOperationsSchema.parse(operations)) {
    if (operation.op === "setSeed") project.seed = operation.seed;
    else if (operation.op === "addVoice") project.voices.push(operation.voice);
    else if (operation.op === "addEffect")
      project.effects.push(operation.effect);
    else if (operation.op === "removeEffect") {
      const index = project.effects.findIndex((e) => e.id === operation.id);
      if (index < 0) throw new Error(`Unknown effect ${operation.id}`);
      project.effects.splice(index, 1);
    } else {
      const index = project.voices.findIndex((v) => v.id === operation.id);
      if (index < 0) throw new Error(`Unknown voice ${operation.id}`);
      const voice = project.voices[index]!;
      switch (operation.op) {
        case "removeVoice":
          project.voices.splice(index, 1);
          break;
        case "setGain":
          voice.gain = operation.gain;
          break;
        case "setEnvelope":
          voice.envelope = operation.envelope;
          break;
        case "setFrequency":
          if (!("frequency" in voice))
            throw new Error(`${voice.id}: no frequency sweep`);
          voice.frequency = operation.frequency;
          break;
        case "setOde":
          if (voice.type !== "nonlinear")
            throw new Error(`${voice.id}: not a nonlinear ODE`);
          Object.assign(voice, {
            sigma: operation.sigma,
            cReal: operation.cReal,
            cImag: operation.cImag,
          });
          break;
      }
    }
  }
  return parseSound(project);
}
