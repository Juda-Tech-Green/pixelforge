import { z } from "zod";

const id = z.string().min(1).max(128);
const integer = z.number().int().min(-1024).max(1024);
const rect = z.strictObject({ x: integer, y: integer, width: z.number().int().min(1).max(64), height: z.number().int().min(1).max(64) });
const feature = z.strictObject({
  box: rect.describe("Neutral feature pixels, in face/head-local coordinates"),
  region: rect.describe("Exclusively owned editable region; may contain no unrelated artwork"),
});
export const facialLandmarksSchema = z.strictObject({
  format: z.literal("pixelforge-facial-landmarks"), version: z.literal("1.0"), id,
  profile: z.enum(["front", "left-visible", "right-visible"]),
  layer: id.describe("Dedicated transparent feature layer"),
  surfaceLayer: id.describe("Separate opaque face surface; edits cannot extend into transparent pixels"),
  bounds: rect,
  maxMove: z.number().int().min(1).max(4).default(2),
  minSeparation: z.number().int().min(0).max(8).default(0),
  features: z.strictObject({ leftEye: feature.optional(), rightEye: feature.optional(),
    leftBrow: feature.optional(), rightBrow: feature.optional(), mouth: feature }),
}).meta({ id: "pixelforge-facial-landmarks" });
export const expressionTypes = ["neutral", "tired", "focused", "worried", "surprised", "angry", "happy"] as const;
const signed = z.number().min(-1).max(1);
export const semanticExpressionSchema = z.strictObject({
  format: z.literal("pixelforge-semantic-expression"), version: z.literal("1.0"), id,
  expression: z.strictObject({ type: z.enum(expressionTypes), intensity: z.number().min(0).max(1),
    overrides: z.strictObject({ eyeOpen: signed.optional(), browLift: signed.optional(), browTilt: signed.optional(),
      mouthCurve: signed.optional(), mouthOpen: z.number().min(0).max(1).optional() }).optional() }),
  targets: z.array(z.strictObject({ frame: id,
    origin: z.tuple([integer, integer]).optional().describe("Face-local origin on sprite; omit with explicit rig/pose context"),
    mirror: z.boolean().optional(),
  })).min(1).max(64),
}).meta({ id: "pixelforge-semantic-expression" });
export type FacialLandmarks = z.infer<typeof facialLandmarksSchema>;
export type SemanticExpression = z.infer<typeof semanticExpressionSchema>;
export const semanticExpressionCapabilities = {
  introducedIn: "0.8.3", expressions: expressionTypes, intensity: [0, 1],
  schemas: { request: "capabilities --schema semanticExpression", landmarks: "capabilities --schema facialLandmarks" },
  requiredInputs: ["request", "--sprite FILE", "--landmarks FILE"],
  outputs: ["operations 1.0", "sprite 1.0", "JSON diagnostics and provenance"],
  context: "Sprite face-local origin per selected existing frame; optional --rig/--pose/--joint uses existing solved FK",
  limitations: ["Explicit simple feature artwork and exclusively owned regions on a dedicated transparent layer",
    "Opaque surface mask required; no inference, new frames, interpolation, eye gaze or rig-shape editing",
    "One rig pose per invocation; rotated raster quantization may suppress unsafe features", "64 frames, local face at most 64x64; movement 1..4 pixels"],
};
