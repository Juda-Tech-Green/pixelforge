# Semantic records office — v0.9.0

Requires the matching PixelForge 0.9.0 runtime/packages.
`layout-a.room.json` and `layout-b.room.json` are editable room1.0 templates.
The evaluation script prepares a single reusable asset set from existing alpha.1
props and alpha.2 material requests, then writes self-contained room sources
beside that set and resolves both layouts without rebuilding props or textures.

Layout A: cabinet at the left floor anchor, walnut desk toward center using the
cabinet's declared ground anchor, window centered on the wall. Layout B: desk
at the left, cabinet at the right, window unchanged. Both have a pre-materialized
plaster wall and a simple flat floor. No prior Antigravity assets are modified.

Exact evaluation command from repository root, with a NEW directory:

```powershell
node examples/semantic-room/evaluate.mjs --out "$env:TEMP\pixelforge-room-alpha3-antigravity"
```

The output contains:

- `assets/`: one shared desk, cabinet, window and full-size plaster wall, plus
  their explicit source preparation artifacts. Material/geometry preparation is
  outside the layout loop and runs once.
- `layout-a.room.json`, `layout-b.room.json`: ready-to-use editable sources with
  paths relative to each room file. Repository templates need this preparation.
- `layout-*.scene.json`: ordinary scene1.0 manifests for existing scene tools.
- `layout-*.sprite.json`: editable room sprites rendered by the existing engine.
- `layout-*.mapping.json`: asset/instance positions, dimensions, layer/depth,
  anchors, provenance, source file hashes and background surface-region boundary.
- `layout-*.resources.json`: optional native resource snapshot maps for API replay.
- `layout-a.png`, `layout-b.png`: 2× nearest-neighbor previews.
- `evaluation.json`: doctors/resolutions and unchanged pre/post source hashes.

Each prepared asset is shared, regardless of instance count. Resolved scene
billboards reference its existing frame. No material request is interpreted in
the room resolver, and translated texture patterns retain their local pixels.
The optional resource map is one snapshot per asset, not new source files per
instance. Source files remain immutable.

After preparation, run from the output directory or use absolute paths:

```powershell
npm run cli -- capabilities --schema room
npm run cli -- room resolve PATH/layout-a.room.json --out PATH/office.scene.json --sprite PATH/office.sprite.json --mapping-out PATH/office.mapping.json --json
npm run cli -- doctor PATH/layout-a.room.json --json
npm run cli -- preview PATH/office.sprite.json --scale 2 --out PATH/office.png --json
```

Source asset paths resolve relative to the room JSON, independently of the process
working directory. Only explicitly declared paths are read; no asset scanning.
For existing `scene render` or scene doctor, pass the same `--asset ID=SPRITE`
bindings. For API replay, convert the resource map's documents with `fromDocument`
and call `renderScene(scene, resources)`. There is no additional scene renderer.

Room contract: format pixelforge-room, version1.0, id/name/canvas/background
palette, named assets and instances. Asset type defaults to sprite; explicit prop
references compile once per asset per resolution, without materials. Multi-frame
sources require an existing frame ID. Instances choose layer, integer depth and
either anchor/align/offset or explicit top-left position. Transform support is
identity/translation only. Duplicate IDs, conflicting placements and missing or
ambiguous anchors fail. Intentional clipping requires allowClipping:true; overlap
is allowed.

Room anchors: room.wall.left/center/right and room.floor.left/center/right. They
use the left/center/right canvas X and their region's mid-height Y. Standard
frame anchors and declared prop ground/surface/origin anchors remove bounding-box
arithmetic. Instance targets use ID.anchor. The smallest currently available ID
resolves first after dependencies; render order is semantic layer, explicit depth,
then ID. Fixed scene projection maps canvas pixels directly. No physical depth
or real-world perspective is inferred from art.

Source RGBA colors/alpha are preserved exactly; room palette indices can be
remapped into a merged palette. Overflow above 256 colors errors rather than
quantizes. Source metadata/anchors remain in mappings and derived provenance.
Named background surfaceRegions are compatible with the alpha.2 explicit mask
adapter on the resulting room sprite; existing fingerprints are unchanged.

Limits: static rectangular rooms, one selected frame per resource, no scaling,
rotation, flips, automatic background tiling/material stacking, lighting, physics
or clutter. Background sprite dimensions must exactly match the wall/floor region.
32 resources, 64 instances, 32 combined anchors per resource and inherited scene
work limits. Successful doctor/pixel tests do not replace Antigravity visual review.
