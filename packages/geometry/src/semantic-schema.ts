import { z } from "zod";
import { bodyShapeSchema, geometryIdSchema as id, poseSchema } from "./rig-schema.js";
import { vec2Schema } from "./projection.js";

export const postureNames = ["neutral", "upright", "slumped", "lean_forward"] as const;
export const armChainSchema = z.strictObject({ root: id, middle: id, end: id });
const bend = z.union([z.literal(1), z.literal(-1)]);
export const semanticTargetSchema = z.union([
  z.strictObject({ type: z.literal("coordinate"), space: z.literal("world"), position: vec2Schema }),
  z.strictObject({ type: z.literal("coordinate"), space: z.literal("joint-local"), joint: id, position: vec2Schema }),
  z.strictObject({ type: z.literal("contact"), id }),
  z.strictObject({ type: z.literal("object-anchor"), object: id, anchor: id }),
]);
const hand = z.strictObject({ target: semanticTargetSchema, bend: bend.optional() });
export const semanticPoseSchema = z.strictObject({
  format: z.literal("pixelforge-semantic-pose"), version: z.literal("1.0"),
  id, rig: id, basePose: id.optional(),
  posture: z.strictObject({ type: z.enum(postureNames), strength: z.number().finite().min(0).max(1) }).optional(),
  roles: z.strictObject({ spine: id.optional(), chest: id.optional(), neck: id.optional(),
    leftArm: armChainSchema.optional(), rightArm: armChainSchema.optional() }).optional(),
  hands: z.strictObject({ left: hand.optional(), right: hand.optional() }).optional(),
  overrides: z.strictObject({ rotations: poseSchema.shape.rotations.unwrap().optional(),
    rootTranslation: poseSchema.shape.rootTranslation.unwrap().optional(),
    facing: poseSchema.shape.facing.unwrap().optional() }).optional(),
  attachment: z.strictObject({ object: id, primaryHand: z.enum(["left", "right"]), grip: id,
    secondaryGrip: z.strictObject({ hand: z.enum(["left", "right"]), anchor: id, bend: bend.optional() }).optional(),
    occlusion: z.discriminatedUnion("type", [
      z.strictObject({ type: z.literal("sandwich"), palmShapes: z.array(id).min(1).max(16), frontShapes: z.array(id).min(1).max(16) }),
      z.strictObject({ type: z.literal("body-only"), afterLayer: id }),
    ]),
  }).optional(),
}).meta({ id: "urn:pixelforge:semantic-pose:1.0" });
/** A rigid prop reuses existing rig shapes and palette indices; no mesh is synthesized. */
export const heldObjectSchema = z.strictObject({
  format: z.literal("pixelforge-held-object"), version: z.literal("1.0"), id,
  transform: z.strictObject({ space: z.literal("world"), position: vec2Schema,
    rotation: z.number().finite().min(-Math.PI).max(Math.PI) }),
  anchors: z.record(id, vec2Schema).refine(a => Object.keys(a).length <= 32),
  shapes: z.array(bodyShapeSchema).min(1).max(64),
}).superRefine((o, ctx) => {
  const seen = new Set<string>();
  o.shapes.forEach((s, i) => {
    if (seen.has(s.id)) ctx.addIssue({ code: "custom", path: ["shapes", i, "id"], message: "Prop shape IDs must be unique" });
    seen.add(s.id);
    if (s.joint !== o.id) ctx.addIssue({ code: "custom", path: ["shapes", i, "joint"], message: "Rigid prop shapes must reference the object ID as their local origin" });
    if (s.type === "bone") ctx.addIssue({ code: "custom", path: ["shapes", i, "type"], message: "Rigid props support existing ellipse, polygon and sprite shapes; articulated bone props are unsupported" });
  });
}).meta({ id: "urn:pixelforge:held-object:1.0" });
export type SemanticPoseRequest = z.infer<typeof semanticPoseSchema>;
export type HeldObject = z.infer<typeof heldObjectSchema>;
export type SemanticTarget = z.infer<typeof semanticTargetSchema>;
