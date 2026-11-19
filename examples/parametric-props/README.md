# Parametric props — v0.9.0 example

PixelForge v0.9.0; use the matching 0.9.0 runtime/package set. The
`pixelforge-parametric-prop` contract is version 1.0. The extension is opt-in.

Four small editable sources share a retro walnut, olive steel and brass palette:

| Source | Component | Front width × height | Projected depth | Detail |
| --- | --- | --- | --- | --- |
| clerk-desk.prop.json | desk | 48 × 28 | 5 | One right pedestal, two drawers |
| executive-desk.prop.json | desk | 72 × 36 | 8 | Two pedestals, three drawers each |
| filing-cabinet.prop.json | cabinet | 24 × 44 | 4 | Four drawers, labels and brass bars |
| office-window.prop.json | window | 32 × 36 | 0 | Two rows/columns, wooden frame and sill |

The two desks use exactly the same component family with different parameters.
These sources were authored through `prop create`, then edited as semantic JSON
parameters. No pixel loops, manual polygons or rasterizer edits are required.

Discover before authoring:

```powershell
npm run cli -- capabilities --json
npm run cli -- capabilities --schema prop
npm run cli -- prop create my-desk --type desk --out my-desk.prop.json
```

Then edit the source parameters/palette roles and resolve through existing geometry:

```powershell
npm run cli -- doctor examples/parametric-props/clerk-desk.prop.json --json
npm run cli -- prop resolve examples/parametric-props/clerk-desk.prop.json --out clerk-desk.sprite.json --out-rig clerk-desk.rig.json --json
npm run cli -- doctor clerk-desk.sprite.json --json
npm run cli -- preview clerk-desk.sprite.json --scale 4 --out clerk-desk.png --json
```

Minimal input shape (the create command supplies documented defaults/palette):

```json
{
  "format": "pixelforge-parametric-prop", "version": "1.0",
  "id": "small-desk", "name": "Small walnut desk",
  "palette": [[0,0,0,0],[42,35,32,255],[133,85,58,255],[191,143,91,255],[82,54,43,255],[202,171,102,255]],
  "colors": {"outline":1,"body":2,"light":3,"shadow":4,"hardware":5},
  "component": {"type":"desk","width":48,"height":28,"drawers":{"side":"right","width":13,"count":2}}
}
```

Use the authoritative `prop` schema for exact fields. Sizes are front-view pixel
dimensions; projected depth is graphic depth, not a physical measure. `legHeight`
means visible feet below the pedestal. Desk drawers are optional. Cabinets keep
their base; windows derive pane sizes from overall size, frame, rows/columns and
mullions. Unrepresentable combinations return actionable diagnostics rather than
silently removing structural details.

Output is ordinary sprite 1.0 with editable supports/body/top/details layers,
stable palette indices, and source/anchor provenance. Optional rig output is
ordinary rig 1.0 with named geometry shapes and one root joint. No old sprite,
rig, pose or render schema/behavior changes. `prop resolve` without output flags
is read-only; `--json` contains native editable results. Existing files need
`--force`, with source alias protection.

For palette-only changes on a generated sprite, use the existing operation batch:

```json
{"version":"1.0","operations":[{"op":"updatePaletteColor","index":2,"color":[102,64,51,255]}]}
```

`apply SOURCE.sprite.json --operations recolor.ops.json --output NEW.sprite.json`
changes the appearance without rebuilding geometry. Adjust the prop's palette too
if future regenerations should retain the new scheme. Manual raster edits remain
editable but are not merged back into the parametric source when regenerating.

Exact Antigravity command, from the repository root (choose a NEW directory):

```powershell
node examples/parametric-props/evaluate.mjs --out "$env:TEMP\pixelforge-props-alpha1-antigravity"
```

This generates editable sprites/rigs, runs doctor on sources and both outputs,
and saves native and 4× nearest-neighbor PNG previews plus `evaluation.json`.
No previous evaluation assets are modified. Open actual images to evaluate
silhouettes, consistent borders, drawers, legs and proportions. Try no more than
two targeted parameter adjustments during artistic evaluation.

Useful negative examples: excessive drawer counts for a short body →
PF_PROP_DRAWERS_DONT_FIT; crowded legs/pedestals → PF_PROP_STRUCTURE_INVALID;
too many panes/thick framing → PF_PROP_PANES_DONT_FIT; missing glass color →
PF_PROP_COLOR_REQUIRED; missing/non-opaque palette references →
PF_PROP_COLOR_INVALID. PF_PROP_LOW_CONTRAST warns when structural roles share
indices; perceptual similarity still needs visual review. Errors produce no output.

Limits: one component, fixed front/top/right projection (front-only
windows), no automatic scene placement, materials, textures, arbitrary cameras,
open drawers or animation. Detailed ornament still requires low-level editing.
This fixture is implementation evidence, not Antigravity artistic acceptance.
