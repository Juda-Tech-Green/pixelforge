# Geometry-aware characters and scenes (v0.7)

Use **Specify → Construct Geometry → Generate Sprite → Inspect → Export**.
Requires Node22.12+ and matching PixelForge0.7.0 packages: core, exporters, cli,
phaser, audio-core, audio-exporters and geometry. Check the installed CLI version
before using these commands. Earlier runtimes retain the ordinary sprite workflow
but do not supply v0.7 rig/scene capabilities. See [CLI setup](cli.md).

Commands below run in a game with the local package set installed. In the source
checkout, replace `node node_modules/@pixelforge/cli/dist/index.js` with
`npm run cli --`. The browser geometry workspace is `/geometry.html`.

## Character creation

Specify canvas, palette, facing, baseline, proportions, animation timing and
required attachments. Select `standard`, `chibi`, `tall`, `childlike` or
`quadruped` as a starting rig. Humanoid presets share their joint topology;
the engine also accepts custom hierarchies.

```sh
node node_modules/@pixelforge/cli/dist/index.js rig create Scout --preset standard --output scout.rig.json --poses scout.poses.json
node node_modules/@pixelforge/cli/dist/index.js rig inspect scout.rig.json --limit 32
node node_modules/@pixelforge/cli/dist/index.js rig pose scout.rig.json --library scout.poses.json --name idle --output idle.pose.json
```

Keep `.rig.json` as the body source and `.poses.json` as the reusable pose/animation
library. To change proportions intentionally, edit parent-relative joint offsets
and body-shape radii/vertices together. The `proportions` record declares expected
dimensions; changing that record alone does not reshape the character. Ellipse,
polygon, bone and referenced-sprite attachments follow joint transforms and retain
palette/layer structure.

Forward kinematics runs automatically in `rig inspect`, `validate` and rendering;
the TypeScript API also exports `forwardKinematics`. Local coordinates use +X right,
+Y down and clockwise radians. Joint rotation controls outgoing bones. Keep
geometry unrounded until rasterization. Change pose angles, rather than independent
world coordinates, to preserve the rig's rest bone lengths.

```sh
node node_modules/@pixelforge/cli/dist/index.js rig pose scout.rig.json --name arm-raised --rotation right-shoulder=-0.6 --output arm-raised.pose.json
node node_modules/@pixelforge/cli/dist/index.js rig solve-ik scout.rig.json --root right-shoulder --middle right-elbow --end right-wrist --target 47,24 --bend 1 --output reach.pose.json
node node_modules/@pixelforge/cli/dist/index.js rig validate scout.rig.json --pose reach.pose.json
node node_modules/@pixelforge/cli/dist/index.js rig render scout.rig.json --pose reach.pose.json --output reach.png --sprite reach.sprite.json
node node_modules/@pixelforge/cli/dist/index.js rig animate scout.rig.json --poses scout.poses.json --animation walk --output walk.sprite.json
```

IK needs a direct root-middle-end chain; unreachable targets are clamped and
reported, and joint limits can leave residual target error. Inspect diagnostics.
The library contains named poses and animation keys, durations, looping and
optional contact intervals. Contacts specify root/middle/end, world position,
start/endTime and tolerance; they are solved after pose interpolation. Do not
claim a planted foot when the reported residual exceeds its tolerance.

For targeted regeneration, `rig animate` accepts `--existing FILE --replace`.
Matching rig provenance and unshared generated frames are required; unrelated
frames/animations are preserved. Use a separate output by default. Geometry
commands refuse existing outputs without explicit `--force` and protect geometry
source paths. Keep editable rig, pose and sprite sources.

## Scene creation

Choose side-view, top-down or three-quarter projection, scene dimensions and
palette. The scene template references a `scout` sprite frame named `idle`:

```sh
node node_modules/@pixelforge/cli/dist/index.js rig render scout.rig.json --pose idle.pose.json --output idle.png --sprite idle.sprite.json
node node_modules/@pixelforge/cli/dist/index.js scene create Workshop --output room.scene.json
node node_modules/@pixelforge/cli/dist/index.js scene inspect room.scene.json --limit 32
node node_modules/@pixelforge/cli/dist/index.js scene depth-order room.scene.json
node node_modules/@pixelforge/cli/dist/index.js scene validate room.scene.json --asset scout=idle.sprite.json
node node_modules/@pixelforge/cli/dist/index.js scene render room.scene.json --asset scout=idle.sprite.json --output room.png --sprite room.sprite.json
```

Edit the scene's camera and object positions/dimensions in structured JSON or the
Scene workspace. Scene coordinates are `(x,y,z)`: X right, Y ground depth, Z upward.
Side view projects `(x,-z)`; top-down projects `(x,y)`; three-quarter uses configured
projection axes. Screen-to-scene mapping needs a defined inverse plane. Ground
contacts and local anchors transform with the object and its optional parent.

Depth groups run background → midground → actors → foreground; render layers
are explicit. Ground depth guides compatible projections, while side view uses
layers and declared relationships. Add `before`/`after` dependencies using object
IDs or split-part IDs such as `table:rear`. A table's rear can be before the actor
and its front after it, without redrawing the character. Cycles/missing references
fail; stable IDs break unconstrained ties. Footprints are convex and overlap is
only a violation when constrained explicitly. Sprite resources stay external and
must provide the referenced frame and compatible palette colors.

## Inspect and export

Generated output is ordinary editable sprite1.0, compatible with existing drawing,
inspection and export commands:

```sh
node node_modules/@pixelforge/cli/dist/index.js inspect walk.sprite.json --summary
node node_modules/@pixelforge/cli/dist/index.js export walk.sprite.json --format phaser --output assets/scout-walk
```

Inspect previews for silhouette, occlusion, attachment placement and motion before
shipping. Geometry validity does not establish artistic quality. See
[animations](animations.md) for ordinary frame edits and
[Phaser export](phaser-export.md) for managed exports/integration. Use direct pixel
operations when a rig or scene graph would add no useful structure.
