# Semantic room composition — v0.9.0

Requires matching 0.9.0 runtime/packages. Discover
`capabilities --json` → `rooms`, then `capabilities --schema room`. A separate
`pixelforge-room` 1.0 request compiles to the existing scene1.0 format. No old
scene, sprite, prop or material contract changes.

1. Prepare immutable sprite variants with the existing prop/material commands.
   Select grain/finish before composing; room placement never reapplies materials.
2. Declare each resource once in `assets` with an explicit source path relative to
   the room file. Default type is sprite; multi-frame sprites require `frame`.
   Explicit `type:prop` compiles a plain prop once per asset during resolution.
   Prefer already materialized sprite references for textured props.
3. Set canvas/background and name each instance. Choose a semantic layer and
   explicit depth, then a target anchor, source `align` and pixel offset.
4. Resolve a scene manifest and optionally a derived editable sprite/mapping.
5. Doctor the room (loads only declared paths), inspect positions/order/diagnostics,
   then use existing preview on the derived sprite and open the actual PNG.
6. Rearrange offsets/anchors or reuse an asset under another instance ID. Keep
   source variants unchanged; one resource serves all instances.

```sh
npm run cli -- room resolve room.json --out room.scene.json --sprite room.sprite.json --mapping-out room.mapping.json --json
npm run cli -- doctor room.json --json
npm run cli -- preview room.sprite.json --out room.png --scale 2 --json
```

Without outputs resolution is read-only. Existing outputs require --force, which
still protects request/asset paths, hardlink aliases and symbolic destinations.
Optional `--resources-out FILE` saves one normalized resource map per asset for
API replay, including explicit prop references. The scene manifest uses ordinary
asset IDs: existing `scene render --asset ID=SPRITE` works with the same prepared
sprite files. Mapping JSON retains original path/type, frame, position, dimensions,
layer/depth, anchors, source layout identity/metadata and CLI SHA-256 hashes.

Coordinates are integer canvas pixels: +X right, +Y down. For wallHeight H:
wall anchors have Y=floor((H-1)/2); floor anchors have
Y=H+floor((canvas.height-H-1)/2). Their left/center/right X values are
0, floor((width-1)/2), width-1. Names are `room.wall.left|center|right` and
`room.floor.left|center|right`. Floor anchors describe the region's mid-height,
not the wall/floor seam. Offsets are artistic margins rather than bounding-box
calculations.

Placement is `topLeft = targetAnchor + offset - sourceAnchor`. Instance targets
use `instanceId.anchorName`. Standard source anchors are center, top-left/center/
right and bottom-left/center/right. `origin` uses declared metadata/asset origin
when present, otherwise [0,0]. Centers floor half-pixel coordinates consistently.
Prop ground/top/surface/origin anchors come from existing metadata. Project/frame
game anchors and explicit asset anchors are supported; animation/entry game
scopes are deferred. Conflicting declarations fail rather than pick a winner.
Ground/surface anchors for ordinary sprites must be declared; no location guessing.

Dependencies resolve before dependents, choosing the smallest available instance
ID after each resolution. Cycles/missing instances or anchors fail. Source order
does not control occlusion. Layers render architecture → background-furniture →
furniture → actors → foreground, above background wall/floor. Within a layer,
depth sorts numerically, then instance ID. The adapter cancels implicit position
depth in the existing fixed identity scene projection; art is translated at scale
one. No appearance-based depth inference, transform interpolation or new camera.

Only translations/identity transforms are supported. Off-canvas placements error
unless explicitly `allowClipping:true`; intentional clipping warns and uses existing
renderer clipping. Overlap is permitted. There is no collision/physics solver.
Background palette fills are integer aligned; optional wallAsset/floorAsset must
exactly match their region dimensions. Prepare each background texture once;
no automatic tiling, scaling, lighting or material stacking.

The room scene palette merges exact composited RGBA colors deterministically;
source indices may be remapped, while source colors, alpha and texture pixels
stay unchanged. All source documents remain external/editable; derived sprites
keep one layer per scene object and source/anchor mappings in metadata. More than
256 merged colors is an error, not automatic quantization. Existing scene work
limits and a 32-asset/64-instance limit apply.

`renderRoom` returns explicit `surfaceRegions` declarations for named wall/floor
layers. Use the existing material mask regions adapter on that specific room
sprite if desired. It binds the normal alpha.2 layout fingerprint; no fingerprint
changes or material execution occur during room composition. Transparent custom
background imagery may require authored ownership/protection before material use.

Diagnostics: PF_ROOM_ASSET_MISSING, SPRITE_INVALID, PROP_INVALID,
FRAME_AMBIGUOUS, ANCHOR_MISSING, ANCHOR_AMBIGUOUS, ANCHOR_INVALID,
INSTANCE_MISSING, INSTANCE_DUPLICATE, INSTANCE_RESERVED, PLACEMENT_CYCLE,
PLACEMENT_CONFLICT, LAYER_INVALID, CANVAS_INVALID, OFF_CANVAS,
TRANSFORM_UNSUPPORTED, BACKGROUND_SIZE, PALETTE_LIMIT and SCENE_INVALID
(all PF_ROOM_ prefixed). Corrective paths/suggestions accompany errors; no partial
outputs on errors. Scene validation and pixel-preservation checks are separate
from actual artistic review.

See `examples/semantic-room/README.md` for a bounded two-layout records office.
