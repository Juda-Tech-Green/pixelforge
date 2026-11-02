import { z } from "zod";
const path = z.string().min(1).max(1024);
export const assetManifestSchema = z.strictObject({
  version: z.literal("1.0"),
  assets: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/),
        source: path,
        output: path,
        layout: z.enum(["atlas", "spritesheet"]).default("atlas"),
        runtimeKey: z
          .string()
          .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/)
          .optional(),
        operations: z.array(path).max(100).optional(),
        inputs: z.array(path).max(100).optional(),
        options: z
          .strictObject({
            columns: z.number().int().positive().max(1024).optional(),
            padding: z.number().int().nonnegative().max(1024).optional(),
            maxWidth: z.number().int().positive().max(32767).optional(),
            maxHeight: z.number().int().positive().max(32767).optional(),
            powerOfTwo: z.boolean().optional(),
          })
          .optional(),
      }),
    )
    .min(1)
    .max(1000),
});
