# Procedural materials — v0.9.0

Requires the matching PixelForge 0.9.0 runtime/packages. New material,
surface mask and authored surface-region contracts are version 1.0. Existing
prop/sprite/rig schemas and generation behavior are unchanged.

Examples reuse alpha.1 desk/cabinet components with extra explicit palette colors:

- `walnut.material.json`, `honey-oak.material.json`: two finishes on the **same**
  original desk sprite/mask; the geometry, hardware, legs and outlines stay fixed.
- `brushed-olive.material.json`: subtle brushing on cabinet drawer faces; labels,
  handles and drawer borders are protected by final visible geometry ownership.
- `warm-plaster.material.json`, `aged-brick.material.json`: small authored wall
  fixture, made with ordinary init/apply rectangle operations. No room is built.

Discover schemas before authoring:

```powershell
npm run cli -- capabilities --json
npm run cli -- capabilities --schema material
npm run cli -- capabilities --schema surfaceMask
npm run cli -- capabilities --schema surfaceRegions
```

Example request:

```json
{
  "format":"pixelforge-material", "version":"1.0", "id":"walnut",
  "type":"wood", "seed":1953, "intensity":1, "origin":[0,0],
  "palette":{"base":10,"highlight":11,"shadow":12},
  "parameters":{"direction":"horizontal","scale":1,"density":0.25,"variation":0.25,"wear":0.03}
}
```

Palette entries must already exist and be opaque; index zero remains transparent.
Families expose different bounded parameters: directional grain/brushing and
sparse wear/scratches, plaster patch size, brick size/mortar/stagger, or ordered
dither density/scale. Seeds are uint32. Patterns use deterministic coordinate
hashes rather than ambient RNG, floating color blends or texture dependencies.
Grain scales are pixels, not physical units. Intensity zero is unchanged; at
nonzero intensity palette.base establishes the finish while intensity controls
detail density/variation. Brick joints remain complete; only brick variation is
intensity-scaled. Negative/positive origin shifts phase predictably. Brick repeat
periods are width+mortarWidth and height+mortarWidth, doubled vertically for a
fully repeating staggered pattern. Seed changes brick tones, not joint geometry.

The prop mask adapter reuses the existing renderer with temporary ownership
markers. It excludes exterior/part outlines and pixels covered by later visible
parts, so neither labels nor hardware are guessed from their colors. Parts must
be named explicitly; handles/labels cannot be selected as material surfaces.
Original prop pixel layout must match stored geometry; palette-only changes are
allowed. General sprites use explicit `wall.regions.json` rectangles and reserved
structure. These declarations are an ownership contract, not automatic image
segmentation. Protect all unrelated artwork when adapting other sources.

```powershell
npm run cli -- prop resolve examples/procedural-materials/desk.prop.json --out desk.sprite.json --json
npm run cli -- material mask desk.sprite.json --parts desk-top-surface,desk-right-drawer-0,desk-right-drawer-1 --out desk.mask.json --json
npm run cli -- doctor examples/procedural-materials/walnut.material.json --sprite desk.sprite.json --mask desk.mask.json --json
npm run cli -- material apply examples/procedural-materials/walnut.material.json --sprite desk.sprite.json --mask desk.mask.json --out walnut.sprite.json --operations-out walnut.ops.json --json
npm run cli -- doctor walnut.sprite.json --json
npm run cli -- preview walnut.sprite.json --scale 4 --out walnut.png --json
```

Use `--surfaces IDS` to select a subset of the already declared mask. Without
output flags material application is read-only. Sprite/operations outputs are
ordinary editable format 1.0, usable with existing exporters. Sprite metadata
retains original prop source/anchors and adds material provenance. Operation
batches reproduce pixel edits; keep the result report for provenance metadata.
Existing output paths require --force; source request/mask/sprite aliases remain
protected. Apply each finish to the original sprite. Masks reject changed pixel
layouts, including already textured derivatives; deliberate raster edits need a
new explicitly authored mask.

Exact Antigravity evaluation command from the repository root, using a NEW folder:

```powershell
node examples/procedural-materials/evaluate.mjs --out "$env:TEMP\pixelforge-materials-alpha2-antigravity"
```

The script saves original desk/cabinet/wall sprites, ownership masks, five editable
material variants and operation batches, contextual/output doctor results, native
and 4x nearest-neighbor PNG previews, and `evaluation.json`. Previous Antigravity
assets are not read as writable outputs or regenerated.

Inspect native-size grain, brushing/mottling, readable mortar, and untouched
hardware/labels/outlines. Material variation should support the silhouette. Small
surfaces that cannot carry readable detail are left unchanged with
PF_MATERIAL_SURFACE_SMALL. Errors for missing/stale/out-of-bounds/overlapping or
unsafe masks, invalid palette/settings/density/type and brick spacing produce no
variant. PF_MATERIAL_LOW_CONTRAST is nonfatal when palette indices coincide;
perceptually similar distinct colors still need artistic review.

Limits: explicit masks, discrete palette roles, integer coordinates; 100000 owned
pixels, 64 surfaces. No automatic segmentation, new renderer, lighting simulation,
arbitrary perspective, room composition or articulated furniture. Direction is
canvas-relative, so different faces may need separate requests. Quantization and
finite seed phases can yield identical results on tiny masks; dither has sixteen
phases. Structural validation does not establish artistic acceptance.
