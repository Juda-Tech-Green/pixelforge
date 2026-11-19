# Semantic expression authoring example

PixelForge v0.8.3; use the matching 0.8.3 runtime/package set.
This isolated 32x32 three-quarter face has one visible eye, brow and mouth.
The two existing neutral source frames share the same face artwork, palette and
local landmarks. Their existing `reaction` animation supplies timing. No previous
clerk evaluation assets are changed or used as writable output.

Run from the repository root (the output directory must not exist):

```powershell
node examples/semantic-expression/evaluate.mjs --out "$env:TEMP\pixelforge-v083-antigravity"
```

The script resolves tired onto the existing `tired` frame, then surprised onto
the still-neutral `surprised` frame of the same source variant. It writes:

- `tired.ops.json`, `surprised.ops.json`: ordinary editable operations 1.0 batches.
- `tired.sprite.json`, `transition.sprite.json`: ordinary editable sprites 1.0.
- `reaction.png`, `reaction.contact.json`: existing labeled contact-sheet output.
- `surprised.png`: single-frame PNG preview.
- `evaluation.json`: full results, provenance, doctor checks and preview paths.

The resolver always includes operations/variant in JSON; no files are written
unless output flags are supplied. Individual command:

```powershell
npm run cli -- sprite expression resolve examples/semantic-expression/tired.expression.json --sprite examples/semantic-expression/source.sprite.json --landmarks examples/semantic-expression/face.landmarks.json --operations-out "$env:TEMP\tired-expression.ops.json" --out "$env:TEMP\tired-expression.sprite.json" --json
```

Request example (`surprised.expression.json`):

```json
{
  "format": "pixelforge-semantic-expression",
  "version": "1.0",
  "id": "clerk-surprised",
  "expression": { "type": "surprised", "intensity": 1 },
  "targets": [{ "frame": "surprised", "origin": [7, 4] }]
}
```

`face.landmarks.json` declares head-local boxes, not absolute canvas feature
coordinates. `origin` places this local face on each frame. `profile` supports
front, left-visible and right-visible. Each named feature has a neutral `box` and
an exclusively owned `region` for safe deformation; the enclosing `bounds` and
`surfaceLayer` protect head silhouette/transparency. All source ink in a region
must fit its neutral box. Features use a dedicated transparent `layer` so clearing
old ink reveals the unchanged surface, rather than erasing skin/artwork. Mouth
and the profile's visible eye(s) are required; brows are optional. No automatic
segmentation or migration of flattened faces is provided.

Presets: neutral, tired, focused, worried, surprised, angry, happy. Intensity is
0..1. Optional overrides: eyeOpen, browLift, browTilt, mouthCurve (-1..1) and
mouthOpen (0..1), as absolute normalized controls. Eye pixels scale vertically;
brows move/tilt; existing mouth pixels form curved or opened arcs. Colors are
reused without antialiasing. This is intentionally a simple facial-ink workflow,
not arbitrary character-art generation.

Operations use the unmodified apply pipeline, e.g.:

```json
{"version":"1.0","operations":[{"op":"setPixel","frame":"surprised","layer":"features","x":17,"y":10,"color":1}]}
```

To apply a saved batch separately, use existing `apply SOURCE --operations OPS
--output NEW_VARIANT`, then `doctor NEW_VARIANT --json`. Do not apply it to a
different source/pose; the resolution report records source paths/SHA-256 hashes
and source geometry metadata. Keep this report with reusable request/landmarks.

Discover the authoritative schemas with `capabilities --schema semanticExpression`
and `--schema facialLandmarks`. Doctor a request with `--sprite SOURCE --landmarks
FACE`; without context doctor reports schema-only information. Resolve with
missing eyes → `PF_FACE_EYE_MISSING`; invalid intensity →
`PF_EXPRESSION_INTENSITY_INVALID`; unknown frame → `PF_EXPRESSION_FRAME_INVALID`.
Unsafe region/surface movement warns `PF_FACE_MOVEMENT_EXCEEDED` and retains the
feature; impossible separation retains the frame (`PF_FACE_SEPARATION`). A
one-pixel feature may not change (`PF_EXPRESSION_QUANTIZED`). No silent clipping.

Rig-derived sprites can use `--rig FILE --pose FILE --joint head` with origins
omitted: existing FK supplies the local transform, including reflection. The
sprite's provenance, canvas and palette must match the already resolved pose;
one pose is supported per invocation. Direct rig-shape expression output,
automatic landmark detection, interpolation/new frames, pupil gaze and flattened
face editing are deferred. Existing rig/pose/gaze/render behavior is unchanged.

Antigravity should inspect whether the tired/surprised states read clearly at
native size and in the contact sheet, confirm only declared feature pixels
change, and review diagnostics before approving publication. Automated checks
establish structural/pixel invariants, not artistic readability.

## Reported Antigravity acceptance

User-reported artistic acceptance: PASS for Tired → Focused → Surprised, reusing
the same character geometry and palette without manually authored facial
setPixel coordinates. Standard editable operations, valid sprite output,
successful preflight, native/enlarged previews, actionable region diagnostics
and original-source preservation were reported. Evaluation assets were neither
regenerated nor included in this release fixture. The evaluated three-state
sequence uses discrete existing frames; continuous interpolation is unavailable.

Allow brow-region padding above/below the neutral box for lift/tilt while keeping
regions disjoint and inside the face surface. PF_FACE_MOVEMENT_EXCEEDED retains
the feature and warns: enlarge its explicitly owned safe region or reduce
intensity/overrides. PF_EXPRESSION_QUANTIZED remains a nonfatal warning.
