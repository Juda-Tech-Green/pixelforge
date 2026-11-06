import { z } from "zod";
const key = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const relativeFile = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/);
export const audioManifestSchema = z
  .strictObject({
    version: z.literal("1.0"),
    kind: z.literal("pixelforge-audio"),
    assets: z
      .array(
        z.strictObject({
          key,
          file: relativeFile,
          source: relativeFile,
          sampleRate: z.union([
            z.literal(22050),
            z.literal(44100),
            z.literal(48000),
          ]),
          durationMs: z.number().positive().max(10000),
        }),
      )
      .min(1)
      .max(128),
    events: z
      .array(
        z.strictObject({
          animation: z.string().min(1).max(128),
          event: z.string().min(1).max(128),
          sound: key,
        }),
      )
      .max(256)
      .default([]),
  })
  .superRefine((m, ctx) => {
    const keys = m.assets.map((a) => a.key);
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: "custom", message: "Duplicate audio keys" });
    for (const e of m.events)
      if (!keys.includes(e.sound))
        ctx.addIssue({
          code: "custom",
          message: `Unknown event sound ${e.sound}`,
        });
  });
export type AudioManifest = z.infer<typeof audioManifestSchema>;
