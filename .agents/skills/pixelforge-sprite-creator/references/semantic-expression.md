# Semantic facial expressions (v0.8.3)

Requires the matching 0.8.3 runtime/package set. Check live
`capabilities --json` → `semanticExpressions`; 0.8.2 installations do not
include this opt-in feature. Query `capabilities --schema
semanticExpression` and `--schema facialLandmarks`; these are authoritative.

1. Discover supported expressions and limits.
2. Inspect landmark schema and the existing sprite's selected frame/layer IDs.
3. Select a neutral sprite with explicit facial ink on a separate transparent
   layer above an opaque head surface. Preserve the source and its palette.
4. Declare face/head-local bounds, profile, neutral feature boxes and disjoint
   owned editable regions. Both eyes are required for `front`; `left-visible` /
   `right-visible` require only that eye. Mouth is required, brows optional.
   Regions must contain no unrelated artwork. Supply the actual opaque surface
   layer as a transparency mask. Do not infer landmarks from arbitrary colors.
5. Choose neutral, tired, focused, worried, surprised, angry or happy and intensity
   0..1. Optional normalized overrides replace individual intensity-scaled preset
   controls: eyeOpen/browLift/browTilt/mouthCurve -1..1, mouthOpen 0..1.
6. Resolve editable operations using the command below. Without output flags it
   is read-only. JSON includes operations, an editable sprite, diagnostics and
   source provenance; the operations file is an ordinary operations 1.0 batch.
7. Write a new variant with `--out`, or use the existing `apply SOURCE
   --operations OPS --output NEW_VARIANT`. Keep source assets immutable. The
   expression command rejects existing outputs unless `--force` and protects
   request/landmark/sprite/rig/pose paths and aliases even with force.
8. Doctor the request with its context, then doctor the output sprite.
9. Generate a preview or an existing animation contact sheet.
10. Inspect the PNG with image-reading tools and refine declared regions or
    intensity if needed. Warnings are structural safeguards, not aesthetic proof.

```sh
npm run cli -- sprite expression resolve request.json --sprite source.sprite.json --landmarks face.landmarks.json --operations-out expression.ops.json --out variant.sprite.json --json
npm run cli -- doctor request.json --sprite source.sprite.json --landmarks face.landmarks.json --json
npm run cli -- doctor variant.sprite.json --json
npm run cli -- preview variant.sprite.json --contact-sheet --animation reaction --out reaction.png --json
```

Targets list existing source frame IDs (an explicit list also represents a frame
range); no frames/timelines are generated. Each target declares the face-local
`origin` on that frame, optionally `mirror`. Shared frame references all change;
duplicate/retarget using ordinary operations first when necessary.

For rig-derived sprites, render an already resolved pose first, preserving its
`pixelforgeGeometry` metadata. Omit target origin/mirror and pass `--rig RIG
--pose POSE [--joint HEAD_ID]`. The CLI reuses existing FK; it checks rig/pose
provenance, canvas and palette. One pose per invocation; no unresolved IK targets
or clamped constraint diagnostics. For changing head poses, resolve each frame
with its matching context. Direct rig-shape expression editing is deferred.

Gaze determines head/neck orientation. Expression changes facial appearance on
the resulting sprite. Resolve pose/gaze first, then expressions; expression does
not alter rig geometry, gaze behavior, eyes' looking direction or silhouettes.

The resolver deforms existing simple feature pixels: eye height, eyebrow lift /
inner tilt, mouth corner curvature / two opening arcs. It does not generate a
face from nothing. Neutral / intensity zero leaves pixels exactly unchanged
unless explicit overrides are supplied. Absolute overrides are not multiplied
by intensity a second time. Movement is bounded by maxMove (1..4 local pixels),
owned regions and the face surface. Integer nearest-neighbor quantization is
deterministic; no blur or antialiasing. Small features may not change visibly.
Unsafe feature movement retains that feature with a warning; separation failure
retains the frame. Schema/landmark/context errors produce no operations/output.

Stable diagnostics include PF_FACE_EYE_MISSING, PF_EXPRESSION_INTENSITY_INVALID,
PF_EXPRESSION_FRAME_INVALID, PF_FACE_BOUNDS_EXCEEDED (errors), and
PF_FACE_MOVEMENT_EXCEEDED, PF_FACE_SEPARATION, PF_EXPRESSION_QUANTIZED,
PF_EXPRESSION_SHARED_FRAME (warnings). Read their corrective suggestions.

See `examples/semantic-expression/README.md` for the isolated two-state example.

Pad brow regions above and below the neutral brow box for lift and tilt (up to
maxMove local pixels), keeping regions disjoint and inside the opaque face.
PF_FACE_MOVEMENT_EXCEEDED retains an unsafe feature; deliberately revise padding
or reduce intensity/overrides rather than ignoring the warning.
PF_EXPRESSION_QUANTIZED is nonfatal and may be expected at small sizes.
