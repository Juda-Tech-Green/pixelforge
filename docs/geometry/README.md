# Geometry-aware creation: v0.7 development checkpoint

The implementation was preserved in local checkpoint33a572a. The subsequent bounded
integration adds the Agent Skill workflow, aligned0.7.0 versions and geometry
schema/package distribution metadata. Feature development remains frozen.

## Available now

- Shared `@pixelforge/geometry`: vectors, affine transforms, camera projection,
  rig/pose/scene schemas, hierarchy checks, FK, two-bone IK and diagnostics.
- Humanoid/chibi/tall/childlike/quadruped presets; joint/bone attachments;
  palette rasterization into ordinary editable sprites.
- Pose interpolation, mirroring/facing, rig animation, explicit foot contacts,
  stable frame IDs and preservation of unrelated frames/animations.
- Scene hierarchy, three projection modes, footprints, anchors, depth/occlusion
  ordering, split-object rendering and referenced sprite composition.
- Functional `rig` and `scene` CLI groups and a browser geometry workspace.
- Character variants, five-pose contacts, GIFs, skeleton overlays, room preview,
  validation/preservation reports, synthetic labels and benchmark artifacts.

## Run from this checkout

Use Node22.12+ and npm. Install local workspace dependencies with `npm install`
if needed, then:

```sh
npm run dev
```

Open `http://127.0.0.1:5173/geometry.html` (or the port Vite prints). Character rig
and Scene tabs share the geometry engine; the existing sprite/audio editors remain.

```sh
npm run cli -- rig create Scout --preset standard --output scout.rig.json --poses scout.poses.json
npm run cli -- rig render scout.rig.json --output scout.png --sprite scout.sprite.json
npm run cli -- rig animate scout.rig.json --poses scout.poses.json --animation walk --output walk.sprite.json
npm run cli -- scene depth-order examples/geometry/room/workshop.scene.json
npm run cli -- scene render examples/geometry/room/workshop.scene.json --asset scout=examples/geometry/standard/idle.sprite.json --output room.png --sprite room.sprite.json
```

Existing output files require explicit `--force`; geometry input sources are
protected. Use the existing sprite CLI/editor to refine or export generated
`.sprite.json` assets. Distribution configuration now includes all seven packages.
`npm run pack:release` is the existing build/schema/prepare/pack pipeline; building
and installing its resulting archives was not exercised during bounded integration.

## Evidence already collected

- Baseline:102 tests passed. Last full suite:132 tests across29 files passed,
  before later changes. Latest typechecks passed.
- Geometry browser smoke passed joint dragging, angles/IK, playback/stepping,
  exports, rig-to-scene references, object moves, anchor edits, projection changes,
  dirty-state/preview/cache fixes, keyboard controls and mobile overflow checks.
- The demonstration pipeline checked preservation of11 unrelated frame hashes.
- Independent UI review confirmed its four findings resolved.
- Controlled interpolation benchmark measured lower foot/bone error with geometry
  constraints, at higher render cost. Two model trials were accurate in both
  workflows; they do not establish cross-model accuracy or aesthetic improvement.
  Astra's direct scene ordering had prior example exposure and is not blind.

Earlier failures involving floating-point assertions, an unreachable foot-contact
preset, frame-order preservation and browser interactions were corrected. No
final full-suite or release acceptance cycle was performed after the last edits.

## Integration and deferred verification

Bounded final integration checks all passed once: `npm run typecheck`, the existing
`scripts/check-skill.mjs` reference/frontmatter check, source CLI version0.7.0 plus
one `rig inspect --limit 1`, and a package metadata inspection. The inspection
confirmed seven aligned packages/lock entries, unchanged external dependencies,
geometry exports and seven distributed schemas. No archives were built or installed
in this integration pass; no additional acceptance suite was run.

- The sprite Agent Skill now documents the geometry-first workflow and current
  CLI examples while retaining ordinary pixel workflows.
- Root, CLI and all workspaces/internal dependencies are aligned to0.7.0. Release,
  prepare and checksum metadata include geometry as the seventh package.
- Rig, pose, pose-library, animation, scene, observation and camera JSON Schemas
  are generated and included in the geometry package's distribution files.
- Final clean-build, packed-consumer, Phaser regression and cross-platform checks
  were not executed for this final snapshot.
- Complex overlapping constraints and less common editor transitions need future
  coverage. Scene footprints are convex; sprites are camera-facing billboards;
  partial occlusion uses explicit split parts. This is not a full3D visibility engine.
- Human visual-quality ratings and ML training remain unperformed. Synthetic
  labels and benchmark inputs/results are available for later work.

Artifacts: `examples/geometry/standard`, `chibi`, `tall`, `room`, `dataset`,
`benchmark` and `model-benchmark`. Browser captures/results are local under
`test-output/geometry-browser`.

The branch remains `codex/procedural-audio-v0.6`, based on d4c5479, with separate
local implementation and integration commits. No push, tag, package publication
or GitHub Release was performed.
