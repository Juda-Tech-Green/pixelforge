import { z } from "zod";
const id = z.string().min(1).max(128),
  pixel = z.number().int().nonnegative().max(1024),
  size = z.number().int().positive().max(1024);
export const rectangleSchema = z.strictObject({
  x: pixel,
  y: pixel,
  width: size,
  height: size,
});
export const collisionBodySchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("rectangle"), ...rectangleSchema.shape }),
  z.strictObject({
    type: z.literal("circle"),
    x: pixel,
    y: pixel,
    radius: z.number().int().positive().max(512),
  }),
]);
export const gameScopeSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("project") }),
  z.strictObject({ type: z.literal("frame"), frameId: id }),
  z.strictObject({ type: z.literal("animation"), animation: id }),
  z.strictObject({
    type: z.literal("entry"),
    animation: id,
    index: z.number().int().nonnegative(),
  }),
]);
export const gameBoxSchema = z.strictObject({
  id,
  kind: z.enum(["hitbox", "hurtbox"]),
  name: id,
  scope: gameScopeSchema,
  rect: rectangleSchema,
  enabled: z.boolean(),
});
export const gameEventSchema = z.strictObject({
  id,
  animation: id,
  index: z.number().int().nonnegative(),
  name: id,
  data: z.record(z.string(), z.json()).optional(),
});
export const gameMetadataSchema = z.strictObject({
  version: z.literal("1.0"),
  origin: z.strictObject({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  body: collisionBodySchema.optional(),
  boxes: z.array(gameBoxSchema).max(4096),
  anchors: z
    .array(
      z.strictObject({
        id,
        name: id,
        x: pixel,
        y: pixel,
        scope: gameScopeSchema,
      }),
    )
    .max(4096),
  events: z.array(gameEventSchema).max(4096),
});
export type GameMetadata = z.infer<typeof gameMetadataSchema>;
export type GameScope = z.infer<typeof gameScopeSchema>;
export type GameBox = z.infer<typeof gameBoxSchema>;
export type CollisionBody = z.infer<typeof collisionBodySchema>;
export interface GameProjectContext {
  width: number;
  height: number;
  frames: { id: string }[];
  animations: {
    name: string;
    frames: { frameId: string; durationMs: number }[];
  }[];
}
export function gameMetadataErrors(
  game: GameMetadata,
  p: GameProjectContext,
): string[] {
  const errors: string[] = [];
  const bounds = (
    r: { x: number; y: number; width: number; height: number },
    label: string,
  ) => {
    if (r.x + r.width > p.width || r.y + r.height > p.height)
      errors.push(`${label} exceeds canvas bounds`);
  };
  const scope = (s: GameScope, label: string) => {
    if (s.type === "frame" && !p.frames.some((f) => f.id === s.frameId))
      errors.push(`${label}: unknown source frame`);
    if (s.type === "animation" || s.type === "entry") {
      const a = p.animations.find((a) => a.name === s.animation);
      if (!a) errors.push(`${label}: unknown animation`);
      else if (s.type === "entry" && s.index >= a.frames.length)
        errors.push(`${label}: unknown animation entry`);
    }
  };
  if (game.body) {
    const b = game.body;
    bounds(
      b.type === "rectangle"
        ? b
        : { x: b.x, y: b.y, width: b.radius * 2, height: b.radius * 2 },
      "Collision body",
    );
  }
  for (const b of game.boxes) {
    bounds(b.rect, `Box ${b.id}`);
    scope(b.scope, `Box ${b.id}`);
  }
  for (const a of game.anchors) {
    if (a.x > p.width || a.y > p.height)
      errors.push(`Anchor ${a.id} exceeds canvas bounds`);
    scope(a.scope, `Anchor ${a.id}`);
  }
  for (const e of game.events)
    scope(
      { type: "entry", animation: e.animation, index: e.index },
      `Event ${e.id}`,
    );
  for (const [label, records] of [
    ["boxes", game.boxes],
    ["anchors", game.anchors],
    ["events", game.events],
  ] as const)
    if (new Set(records.map((r) => r.id)).size !== records.length)
      errors.push(`Duplicate ${label} identifiers`);
  return errors;
}
