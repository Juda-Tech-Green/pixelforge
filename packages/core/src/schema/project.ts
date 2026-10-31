import { z } from "zod";
import { gameMetadataSchema, gameMetadataErrors } from "./game.js";

export const MAX_PIXELS = 1_048_576;
const id = z.string().min(1).max(128);
const byte = z.number().int().min(0).max(255);
export const colorSchema = z.tuple([byte, byte, byte, byte]);
const metadata = z.record(z.string(), z.json()).optional();
export const projectSchema = z
  .strictObject({
    version: z.literal("1.0"),
    name: z.string().min(1).max(256),
    width: z.number().int().min(1).max(1024),
    height: z.number().int().min(1).max(1024),
    palette: z.array(colorSchema).min(1).max(256),
    layers: z
      .array(z.strictObject({ id, name: id, visible: z.boolean() }))
      .min(1),
    frames: z
      .array(
        z.strictObject({
          id,
          layers: z.record(
            z.string(),
            z.array(z.number().int().min(0).max(255)),
          ),
        }),
      )
      .min(1),
    animations: z.array(
      z.strictObject({
        name: id,
        loop: z.boolean(),
        frames: z
          .array(
            z.strictObject({
              frameId: id,
              durationMs: z.number().int().min(1).max(3_600_000),
            }),
          )
          .min(1),
      }),
    ),
    metadata,
  })
  .superRefine((p, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (p.metadata?.pixelforgeGame !== undefined) {
      const result = gameMetadataSchema.safeParse(p.metadata.pixelforgeGame);
      if (!result.success)
        for (const e of result.error.issues)
          ctx.addIssue({
            code: "custom",
            path: ["metadata", "pixelforgeGame", ...e.path],
            message: e.message,
          });
      else
        for (const message of gameMetadataErrors(result.data, p))
          issue(["metadata", "pixelforgeGame"], message);
    }
    if (p.palette[0]?.some((c) => c !== 0))
      issue(["palette", 0], "Palette index 0 must be [0,0,0,0]");
    const unique = (values: string[], path: string) => {
      if (new Set(values).size !== values.length)
        issue([path], "Identifiers must be unique");
    };
    unique(
      p.layers.map((l) => l.id),
      "layers",
    );
    unique(
      p.frames.map((f) => f.id),
      "frames",
    );
    unique(
      p.animations.map((a) => a.name),
      "animations",
    );
    const layerIds = new Set(p.layers.map((l) => l.id));
    p.frames.forEach((f, fi) => {
      for (const l of p.layers)
        if (!Object.hasOwn(f.layers, l.id))
          issue(["frames", fi, "layers"], `Missing layer ${l.id}`);
      for (const [key, pixels] of Object.entries(f.layers)) {
        if (!layerIds.has(key))
          issue(["frames", fi, "layers", key], "Unknown layer");
        if (pixels.length !== p.width * p.height)
          issue(
            ["frames", fi, "layers", key],
            `Expected ${p.width * p.height} pixels`,
          );
        const bad = pixels.findIndex((v) => v >= p.palette.length);
        if (bad >= 0)
          issue(
            ["frames", fi, "layers", key, bad],
            "Palette index does not exist",
          );
      }
    });
    const frames = new Set(p.frames.map((f) => f.id));
    p.animations.forEach((a, ai) =>
      a.frames.forEach((f, i) => {
        if (!frames.has(f.frameId))
          issue(
            ["animations", ai, "frames", i, "frameId"],
            "Unknown frame reference",
          );
      }),
    );
  });
export type ProjectDocument = z.infer<typeof projectSchema>;
export type Color = z.infer<typeof colorSchema>;
export const projectJsonSchema = z.toJSONSchema(projectSchema, {
  target: "draft-2020-12",
});
export function validateProject(input: unknown): ProjectDocument {
  return projectSchema.parse(input);
}
