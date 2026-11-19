# Parametric environments in PixelForge 0.9.0

Use the matching 0.9.0 package set. The portable Sprite Creator skill and runtime
capabilities describe the same pipeline:

```text
Parametric prop source → Editable prop sprite
  → Material request + explicit surface mask → Materialized sprite variant
  → Semantic room instance → Existing scene renderer
  → Editable scene/sprite + nearest-neighbor preview
```

## Discover and create a prop

```powershell
npm run cli -- capabilities --json
npm run cli -- capabilities --schema prop
npm run cli -- prop create clerk-desk --type desk --out clerk-desk.prop.json
npm run cli -- doctor clerk-desk.prop.json --json
npm run cli -- prop resolve clerk-desk.prop.json --out clerk-desk.sprite.json --out-rig clerk-desk.rig.json --json
```

Edit component dimensions, drawers, legs or pane counts in the source JSON and
resolve to a new derived output. Desk, cabinet and window are the three supported
types. Structural diagnostics reject dimensions that cannot retain borders,
handles, labels, leg clearance or panes. Sources use explicit palette roles;
ordinary `updatePaletteColor` operations can recolor an existing sprite without
rebuilding geometry. Keep the parametric source palette consistent for later builds.

## Apply materials with explicit ownership

```powershell
npm run cli -- capabilities --schema material
npm run cli -- capabilities --schema surfaceMask
npm run cli -- material mask clerk-desk.sprite.json --parts desk-top-surface,desk-right-drawer-0,desk-right-drawer-1 --out desk.mask.json --json
npm run cli -- doctor walnut.material.json --sprite clerk-desk.sprite.json --mask desk.mask.json --json
npm run cli -- material apply walnut.material.json --sprite clerk-desk.sprite.json --mask desk.mask.json --out walnut.sprite.json --operations-out walnut.ops.json --json
```

The material request selects wood, metal, plaster, brick or ordered dither,
bounded parameters, existing opaque palette indices and a uint32 seed. Choose
palette roles present in the target sprite; the canonical material example adds
subtle tones explicitly. Never assume indices from another character's palette.
The same source, normalized request, ownership mask and seed reproduce the same
output. Coordinate hashing is independent of mask traversal; brick courses repeat
predictably, while dither has sixteen seed phases. Small targets can quantize to
identical patterns. Intensity zero preserves pixels; nonzero intensity establishes
the selected base finish and controls detail density/variation, with complete
brick joints retained for readability.

Prop masks use named geometry parts and final visible ownership through the
existing renderer. They exclude outlines, covered pixels, labels and hardware;
legs remain unchanged unless explicitly selected. For non-parametric sprites,
author owned/protected rectangles using `surfaceRegions`, then:

```powershell
npm run cli -- capabilities --schema surfaceRegions
npm run cli -- material mask artwork.sprite.json --regions owned.regions.json --out owned.mask.json --json
```

This is explicit authorship, with no color guessing or automatic segmentation.
Protect unrelated structure and omit transparency. A mask fingerprint binds the
source dimensions, visibility, frame/layer IDs and pixel-index layout. Palette-only
RGBA changes are allowed; source layout changes require explicit mask refresh.
Apply each finish to the original source rather than accumulating stale passes.

## Arrange immutable variants through anchors

```powershell
npm run cli -- capabilities --schema room
npm run cli -- room resolve office.room.json --out office.scene.json --sprite office.sprite.json --mapping-out office.mapping.json --json
npm run cli -- doctor office.room.json --json
npm run cli -- doctor office.sprite.json --json
npm run cli -- preview office.sprite.json --scale 2 --out office.png --json
```

A room declares resources once under `assets`; paths resolve relative to the room
JSON. Default type is `sprite`. Use already materialized variants for textured
furniture. Explicit `type:prop` compiles a plain prop once per asset per resolution;
it never applies materials. Multiple instance IDs can reference one asset.

Room wall/floor left, center and right anchors use their region's mid-height Y
and the canvas's left/center/right X. Placement is
`topLeft = targetAnchor + offset - sourceAlignAnchor`. Existing prop ground/surface
anchors, standard frame anchors and explicit compatible asset anchors avoid
bounding-box arithmetic. An instance target is `desk.surface`; absent semantic
anchors are never guessed. Dependencies resolve first, choosing the smallest
available instance ID; missing targets, conflicting anchors and cycles error.

Layers run background wall/floor → architecture → background-furniture → furniture
→ actors → foreground. Within a layer, numeric depth then instance ID determines
order. No appearance-based depth is inferred. Intentional overlap is allowed;
off-canvas placement requires explicit `allowClipping:true` and reports a warning.

**Moving a room instance translates its already-textured pixels. It never
regenerates prop geometry or material grain.** Generate a new variant explicitly
to change the finish. The existing scene renderer receives native sprite
references at unit scale and integer positions. Exact rendered RGBA/alpha are
preserved; scene palette indices may be remapped into a deterministic merged
palette. More than 256 colors errors instead of quantizing.

## Keep sources and derived assets separate

| Format | Purpose |
| --- | --- |
| `pixelforge-parametric-prop` 1.0 | Reusable component parameters and palette roles |
| `pixelforge-material` 1.0 | Reusable seeded finish request |
| `pixelforge-surface-mask` / `pixelforge-surface-regions` 1.0 | Explicit owned/protected pixels or authored rectangles |
| `pixelforge-room` 1.0 | Named resources, spatial relationships and layer/depth policy |
| Existing sprite / rig / scene 1.0 | Editable derived assets and native scene references |
| Existing operations 1.0 | Replayable material pixel edits |
| PNG | Derived visual inspection/export artifact |

Keep requests, masks, variants and mappings. Source inputs remain immutable;
existing destinations require `--force`, with source and alias protection. Ordinary
operation batches reproduce pixel edits; retain result metadata/reports for
provenance. Hand edits to derived sprites are not merged back into parametric
sources on regeneration. Room mapping files retain references, positions, sizes,
anchors, layer/depth, metadata and CLI source SHA-256 hashes. Optional
`--resources-out FILE` saves one normalized resource map per asset for API replay.
Existing `scene render` uses the same `--asset ID=SPRITE` inputs.

The room adapter also exposes named wall/floor `surfaceRegions` for explicit
post-composition material work, subject to the normal material ownership/size
limits. It does not change fingerprint semantics or automatically stack materials.

## Diagnose, preview and refine

Run doctor with the required context before previewing. A material request alone
checks settings; supply sprite/mask for ownership and palette checks. Errors
produce no variant: correct missing references, stale masks, invalid palette
indices, excessive density, undersized drawers/panes or placement cycles. Small
surface and contrast warnings are nonfatal; inspect native-size output and make
targeted parameter/palette refinements. Structural validity is separate from
artistic quality and game integration.

Canonical, bounded demonstrations (use new output directories):

```powershell
node examples/parametric-props/evaluate.mjs --out "$env:TEMP\pixelforge-props-review"
node examples/procedural-materials/evaluate.mjs --out "$env:TEMP\pixelforge-materials-review"
node examples/semantic-room/evaluate.mjs --out "$env:TEMP\pixelforge-environments-review"
```

The room example prepares one asset set before composing two layouts; placement
changes invoke neither prop nor material commands. Previous Antigravity
evaluations reported PASS for all three increments. That is user-reported artistic
acceptance, separate from the bounded release integration check. Evaluation
directories remain local evidence and are not canonical release fixtures.

## Current limitations

- Three prop types: desk, cabinet, window; one static component per source.
- Fixed 2D projection and flat base shading, with optional material texturing.
- Axis-aligned canvas material patterns; authored regions for non-parametric sprites.
- Explicit mask refresh after source layout changes; no automatic segmentation.
- Static integer room translation; one selected frame per asset.
- Exact-size background variants; no automatic tiling or resampling.
- 256 merged colors, 32 assets, 64 instances and inherited scene/material work limits.
- No automatic collision-aware layout, advanced lighting, physics, 3D perspective,
  articulated furniture or automatic clutter.
