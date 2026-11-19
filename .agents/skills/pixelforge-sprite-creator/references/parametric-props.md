# Parametric props — v0.9.0 authoring

Requires matching 0.9.0 packages. Discover the installed runtime: `capabilities --json` → `parametricProps`, then
`capabilities --schema prop`. 0.8.3 installations do not include this
opt-in functionality. The runtime schema is authoritative.

Use semantic component parameters, not hand-authored polygons:

```sh
npm run cli -- prop create clerk-desk --type desk --out clerk-desk.prop.json
npm run cli -- doctor clerk-desk.prop.json --json
npm run cli -- prop resolve clerk-desk.prop.json --out clerk-desk.sprite.json --out-rig clerk-desk.rig.json --json
npm run cli -- doctor clerk-desk.sprite.json --json
npm run cli -- preview clerk-desk.sprite.json --scale 4 --out clerk-desk.png --json
```

Edit the generated source's component dimensions/details and palette roles, then
resolve to new outputs. Desk, cabinet and window are supported. Desks share the
same family: width/height, projected depth, top thickness, leg width/inset, visible
feet height, optional drawer side/count/width/gap/labels and hardware. Cabinets
have projected depth, a base and a drawer stack. Windows have frame, rows/columns,
mullions and an optional sill. No authored face coordinates are needed.

Dimensions are integers in front-view pixels. Desk/cabinet height excludes the
projected top depth; generated canvas fits depth, padding and any sill overhang.
Depth is a fixed graphic top/right projection, not physical 3D depth or a camera.
`legHeight` means visible feet below pedestals; support legs extend to the top.
Omit desk `drawers` for an open table. Drawer panels preserve borders/handles;
labels need larger panels. Unsupported combinations produce errors, not silent
clipping, count reduction or proportion repairs. Review diagnostics before art.

Palette index zero stays transparent. Map body/light/shadow/outline/hardware to
existing opaque palette indices; windows also require glass. Change palette RGBA
values to recolor a source on regeneration. For an existing generated sprite,
ordinary `updatePaletteColor` operations change colors without rebuilding the
object; retain indices for stable semantics. Nonidentical colors can still have
poor perceptual contrast: inspect previews rather than treating validation as an
artistic guarantee.

The resolver compiles to existing named rig polygon shapes and calls the existing
renderer. Sprite 1.0 output has ordinary editable pixel layers. Rig 1.0 output
has an identity pose and one root joint; frame ID is the prop ID. Inspect palette,
layers or geometry part IDs without reading entire dense sprite files. Sprite
metadata retains the normalized source and local canvas anchors under
`pixelforgeProp`; `ground`, `top` and `surface` assist later integration. These
are metadata, not automatic scene placement or generated game hitboxes.

Omit output flags for read-only resolution. `--json` returns editable source,
rig/pose/sprite, part IDs (rig shapes), anchors, source path/hash and diagnostics.
The source is immutable; existing outputs require explicit `--force`. Source
aliases, duplicate outputs and symbolic destinations are rejected. PNGs use
existing `preview`; there is no new prop rasterizer or image-generation service.

Useful diagnostic codes: PF_PROP_PARAMETER_INVALID, PF_PROP_PALETTE_INVALID,
PF_PROP_COLOR_INVALID, PF_PROP_COLOR_REQUIRED, PF_PROP_COMPONENT_UNSUPPORTED,
PF_PROP_STRUCTURE_INVALID, PF_PROP_DRAWERS_DONT_FIT, PF_PROP_PANES_DONT_FIT,
PF_PROP_GEOMETRY_INVALID and PF_PROP_INPUT_INVALID. PF_PROP_LOW_CONTRAST is a
nonfatal warning when structural roles share palette indices. Doctor performs
schema/reference/fit checks without rasterizing; output sprites use normal doctor.

Limitations: one static component per source; fixed projection; no automatic
layout, arbitrary perspective, open/articulated drawers, procedural materials,
textures or animation. Semantic dimensions cover the supported family; bespoke
ornament still needs existing low-level sprite/geometry editing. Regenerating a
prop replaces the derived output and does not preserve hand edits to that output;
keep source and edited variants separately. Runtime limits and successful doctor
checks establish structural validity, not scene coherence or artistic approval.

See `examples/parametric-props/README.md` for a consistent retro office set and
the exact Antigravity evaluation command.
