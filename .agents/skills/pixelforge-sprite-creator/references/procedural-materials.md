# Deterministic procedural materials — v0.9.0

Requires matching 0.9.0 runtime/packages. Discover
`capabilities --json` → `materials`, then schemas `material`, `surfaceMask` and
`surfaceRegions`. Installed runtime discovery is authoritative.

1. Discover supported families: wood, metal, plaster, brick, ordered dither.
2. Select explicit owned surfaces. For a generated prop, inspect the shape IDs
   in `prop resolve --json`, then use `material mask SPRITE --parts IDS --out MASK`.
   Existing geometry/raster ownership protects borders, handles, labels, occlusion
   and all unselected parts/layers; legs change only when explicitly selected.
3. Choose a family/preset from `examples/procedural-materials/`, not a pixel loop.
4. Set existing palette indices and a uint32 seed. Use close colors for restrained
   grain/brushing; the runtime cannot guarantee perceptual contrast. Materials
   never add colors or interpolate RGBA. Brick also requires a mortar role.
5. Apply to a NEW editable variant using the command below; keep the original
   source, request and mask. No output flags means read-only JSON resolution.
6. Doctor with sprite/mask context and doctor the derived sprite.
7. Preview at native and enlarged nearest-neighbor scales. Open actual images.
8. Refine direction/scale/density/seed/palette deliberately; always regenerate
   each finish from the original source rather than accumulate texture passes.

```sh
npm run cli -- material mask desk.sprite.json --parts desk-top-surface,desk-right-drawer-0 --out desk.mask.json --json
npm run cli -- doctor walnut.material.json --sprite desk.sprite.json --mask desk.mask.json --json
npm run cli -- material apply walnut.material.json --sprite desk.sprite.json --mask desk.mask.json --out walnut.sprite.json --operations-out walnut.ops.json --json
npm run cli -- doctor walnut.sprite.json --json
npm run cli -- preview walnut.sprite.json --scale 4 --out walnut.png --json
```

Materials use integer canvas coordinates relative to `origin`; horizontal/vertical
wood and metal grain/brushing respect scale, with sparse interruptions/wear.
Plaster uses low-frequency scalar tonal patches; brick uses periodic courses,
staggered joints and deterministic per-brick variation. Dither uses a seeded
phase of a 4x4 ordered brush. The same normalized request/seed/mask/source gives
identical results, independent of mask traversal. Different seeds can coincide
on small targets; ordered dither has only sixteen phase variations.

Intensity zero preserves pixels. Otherwise palette.base defines the owned
surface's base finish; intensity controls pattern density/variation, not RGB
blending. Brick joints remain fully readable at nonzero intensity; intensity
scales brick variation. Palette selection is an artistic choice, not lighting.

Masks are explicit frame/layer run lists with protected runs. They bind source
dimensions, layer/frame IDs, visibility and palette-index grids using a portable
layout fingerprint (not a cryptographic signature). Palette-only recoloring is
allowed; modified pixel layouts require a new mask. Prop adapters require original
generated prop pixels/provenance and use geometry part IDs, never similar colors.
They reject hardware/label part selection. Apply validates bounds, opacity,
protected-run conflicts and overlaps; no outside-mask painting or silent clipping.

For arbitrary sprites, author `surfaceRegions` JSON with explicit owned rectangles
and protected rectangles, then `material mask SPRITE --regions FILE --out MASK`.
Regions are unions; protection subtracts reserved structure. You must declare
ownership/protected handles/labels/edges; the adapter does not segment artwork or
guess colors. Transparent/translucent owned pixels are rejected. Retain existing
structural borders outside the owned regions. The region example is a small wall,
not room composition.

Native setPixel operations remain editable through existing apply, validation,
preview and exporters. JSON/derived sprite metadata records material, mask,
surfaces and source-layout provenance; CLI also records file SHA-256 hashes.
Saved operation batches reproduce pixel edits; retain the result report for
provenance because ordinary operation batches do not add metadata. Existing
prop geometry/anchors/metadata are preserved. Sources and aliases are protected
even with --force; outputs require explicit replacement.

Diagnostics include PF_MATERIAL_MASK_REQUIRED, MASK_INVALID, MASK_BOUNDS,
MASK_OVERLAP, SOURCE_MISMATCH, SURFACE_MISSING, PALETTE_INVALID,
SETTINGS_INVALID, DENSITY_INVALID, TYPE_UNSUPPORTED, BRICK_SPACING and
UNSAFE_SURFACE (all have the PF_MATERIAL_ prefix). PF_MATERIAL_SURFACE_SMALL
retains unreadably small surfaces with a nonfatal warning; LOW_CONTRAST warns
when palette roles reuse an index. Doctor without context checks only settings;
pass sprite and mask for ownership/palette checks.

Limits: 100000 owned pixels, 64 surfaces, bounded parameters/work. No materials
outside explicit masks, automatic segmentation, generalized perspective,
lighting simulation, room layout or articulated props. Fixed canvas grain may
need different directions per face. Reusing stale masks after raster edits is
intentionally rejected. Validate structure separately from visual acceptance.
