# Changelog

## 0.9.0 — Parametric Props, Procedural Materials & Semantic Room Composition

- Parametric desk, cabinet and window sources compile deterministic editable rig/sprite output through existing geometry; structural fit diagnostics, prop create/resolve and explicit palette roles.
- Seeded wood, metal, plaster, brick and ordered dithering produce native sprite operations/variants through explicit ownership masks. Named prop-part masks protect outlines, hardware, labels and unselected surfaces; non-parametric sprites use authored regions/protection. Mask fingerprints require explicit refresh after source layout changes.
- Semantic room sources resolve wall/floor and instance anchors, dependency cycles, layers/depth and clipping diagnostics into existing scene1.0. Already materialized sprites are translated at integer positions without regenerating geometry or texture. Source/instance mappings, anchor metadata, exact RGBA palette merging and immutable references remain editable.
- Runtime capability/schema discovery, doctor, portable Sprite Creator guidance, canonical examples and the integrated parametric-environments guide connect the full workflow. Package/CLI versions aligned to 0.9.0; all asset/request schema formats remain 1.0.
- User-reported Antigravity artistic acceptance: alpha.1 props PASS, alpha.2 materials PASS and alpha.3 room composition PASS. Prior focused implementation suites reported8/8 each; release verification uses one bounded integration invocation. Evaluation directories are preserved locally and excluded from release fixtures; artwork was not regenerated for publication.
- Limits: three prop types, one static component, fixed2D projection and flat base shading with optional axis-aligned material texturing; authored regions for arbitrary sprites; static integer room translation, one selected frame per asset, exact-size backgrounds and256 merged colors. No automatic collision-aware layout, advanced lighting, physics,3D perspective, articulation or automatic clutter.

## 0.8.3 — Semantic Facial Expressions & Visual Storytelling

- Seven opt-in semantic presets: neutral, tired, focused, worried, surprised, angry and happy. Intensity 0..1; normalized eye opening, brow lift/tilt and mouth curvature/opening overrides.
- Explicit reusable facial landmarks, front/left-visible/right-visible profiles, owned feature regions, bounded integer movement, minimum separation and an opaque face-surface mask preserve palette references and unrelated artwork.
- Deterministic editable operations 1.0 and frame-targeted sprite 1.0 variants through the existing apply pipeline; optional rig/head FK context reuses an already resolved pose. Existing pose/gaze/render behavior remains unchanged.
- Agent-friendly sprite expression resolve command, JSON diagnostics/provenance, protected outputs, capability/schema discovery and contextual doctor checks. Portable skill and isolated example use the existing PNG preview/contact-sheet workflow. Package versions aligned to 0.8.3; schema versions remain 1.0.
- User-reported Antigravity artistic acceptance: PASS for Tired → Focused → Surprised with the same geometry/palette, no manually authored facial setPixel coordinates, standard editable operations, valid sprite output, successful preflight, native/enlarged previews, actionable region diagnostics and preservation of the original sprite. Evaluation assets were not regenerated or included. Discrete frames do not establish continuous interpolation.
- Limits: explicit landmark authoring and dedicated facial layers required; no automatic detection, direct rig-shape expression editing or continuous interpolation. Subpixel changes may quantize to zero: PF_EXPRESSION_QUANTIZED remains nonfatal. Pad brow regions for lift/tilt within disjoint owned regions and the face surface; PF_FACE_MOVEMENT_EXCEEDED retains unsafe features—deliberately enlarge safe padding or reduce intensity/overrides.

## 0.8.2 — Semantic Gaze & Anatomical Constraints

- Gaze toward explicit world positions, named rig joints/roles and held-object anchors using an explicit head-local forward vector and authoritative FK.
- Joint-relative held-object placement from postured joints or roles, including rotated/mirrored local offsets and local radians; existing hand IK, grip alignment and sandwich occlusion remain intact.
- Optional gaze modes: omitted mode and `legacy` preserve head-only behavior; opt-in `anatomical` distributes correction across a direct neck/head chain and reports rendered residual error. Standard-skeleton defaults are neck [-0.20,0.20] and head [-0.35,0.35] radians, not universal human limits. Explicit profiles remain bounded by tighter rig limits.
- Diagnostics include PF_GAZE_LIMIT_REACHED, PF_GAZE_TARGET_UNREACHABLE, PF_GAZE_FORWARD_MISSING, PF_GAZE_ROTATION_CONFLICT, PF_PLACEMENT_JOINT_MISSING and PF_SEMANTIC_CYCLE. Zero direction error alone does not establish convincing pixel art.
- Backward-compatible format 1.0 schema extensions, selective schema generation, two minimal source requests, legacy fingerprints and focused tests; package versions aligned to 0.8.2.
- User-provided Antigravity acceptance: chest-relative folder placement, maintained grip, automatic gaze, stable occlusion and no manual folder world coordinates/head angles. Identical-pose comparison reported legacy/anatomical head angles 1.33945/0.35 rad, anatomical neck 0.20 rad, direction errors 0/0.90167 rad and unchanged hand residual approximately 7.1e-15 px. Anatomical facial readability and neck continuity were reported as preserved: PASS — Ready for release preparation. Evaluation artwork was not regenerated or included.
- Limits: static posing, direct neck/head anatomy, one rigid prop, no full-body optimizer, eye-pixel animation, automatic animation generation or articulated props. Cyclic constraints remain rejected; existing sprite-prop reflection restrictions remain.

## 0.8.1 — Semantic Posing & Object Interaction

- Normalized posture strength, neutral/upright/slumped/lean-forward presets, and explicit rig bone-role mappings.
- World and joint-local hand targets, named contacts and existing two-bone IK, with reachability, wrist residual, chain and rotation diagnostics.
- One held rigid object with named grip anchors, optional secondary grip, derived rig generation and explicit palm/object/front sandwich occlusion using existing geometry.
- `rig resolve-pose` produces existing-schema-compatible pose output; capability/schema discovery and doctor support the new semanticPose and heldObject format 1.0 contracts.
- Portable agent guidance and a minimal semantic-pose source fixture; package versions aligned to 0.8.1 while asset/schema versions remain 1.0.
- Reported Antigravity acceptance: slumped posture, automatic right-arm IK, folder grip alignment, deterministic sandwich occlusion, editable sprite output, discovery, doctor and PNG preview. Reported wrist position was approximately [41, 33] with negligible numerical residual. Evaluation assets were not regenerated or included as release fixtures.
- Limits: static humanoid posing, one rigid prop, no automatic animation generation or articulated props, restricted sprite-prop reflection, and no evaluation of named contact intervals. World placement may require authored coordinates; semantic gaze and joint-relative object placement remain future candidates.

## 0.8.0 — Agent diagnostics and fast previews

- Runtime capability and JSON schema discovery derived from registered CLI commands and existing validators.
- Read-only doctor diagnostics for sprite, sound, rig, pose, pose-library, rig-animation and scene assets, with optional rig/resource context.
- Fast nearest-neighbor PNG previews and existing labeled animation contact sheets, with timing metadata, bounded outputs and explicit overwrite authorization.
- Fully transparent single-frame warnings; direct rig/scene preview remains unavailable. Rig-generated ordinary sprites use the same preview workflow.
- Updated portable agent guidance and synchronized package versions; asset/schema versions remain 1.0.
- Acceptance evidence: five focused workflow tests previously passed, and the user reported successful Antigravity office-clerk evaluation. Evaluation assets remain local and are not release fixtures.
- Local release preparation only; no package publication, tag or GitHub release is implied.

## 0.7.0 — Geometry-aware creation (development checkpoint)

- Shared geometry workspace, rig/pose/scene formats, constrained kinematics, editable raster generation, animation and scene occlusion.
- Geometry CLI/browser workspace and preserved character/scene demonstrations.
- Portable sprite skill geometry workflow, aligned workspace versions and seven-package/schema distribution metadata.
- Bounded integration checks only; no new production release or publication is claimed. See docs/geometry/README.md.

## 0.6.0 — Procedural Sound FX (local implementation)

- Separate sound format 1.0 and shared platform-independent audio core.
- Seeded noise, oscillators, pitch sweeps, envelopes, modulation, damped/nonlinear ODEs and modal resonators.
- Ordered filters, safe delay, four distortion models and deterministic mono PCM16 WAV.
- Audio CLI discovery, atomic structured edits, managed bundles and Phaser sound-event mapping.
- Dedicated browser audio workspace, worker rendering, waveform/playback and five original demos.
- Portable Audio Creator skill and six-package local distribution; verification details in docs/audio/verification.md.
- Sprite/game schema 1.0 retained. No publishing performed. Style DNA remains a future milestone.

## 0.5.0 — Agent Experience & Production Reliability

- Clean-source workspace TypeScript resolution; isolated clean verification and Windows/Linux/macOS CI.
- Verified common Phaser adapter APIs with independent3.90.0/4.2.1 type/WebGL consumers; world anchor and StaticBody synchronization helpers.
- Hash-receipted managed --replace exports with staging, rollback and protection of unknown/modified files.
- Compact/selective inspect, authoritative operations discovery, labeled contact PNG/maps, semantic check contracts and bounded diffs/preservation assertions.
- Custom init palettes, actionable strict pixel diagnostics and hash-based incremental multi-asset builds.
- Unified AGENTS/setup entrypoint, updated progressive skill, release checksums/notes/integrity verification and reproducible benchmark fixtures.
- Static synchronization rejects dynamic bodies/nonuniform static circles before mutation; real loop-event regression covers both tested engines.
- Document/game format1.0 retained. Clean Windows/Alpine Linux execution passed; macOS and publication remain unverified; see v0.5 acceptance matrix. No publication performed.

## 0.4.0

- Portable pixelforge-sprite-creator skill, references, examples and installer lifecycle.
- Independently installable local tarballs with compiled declarations and schemas.
- JSON validation helpers and external Phaser acceptance using packed artifacts.
- Original reference artwork/workflow, sample prompts and compatibility documentation.
- Public publication intentionally pending namespace verification and authorization.

## 0.3.0

Validated game metadata, native Phaser atlases/bundles, separate adapter, metadata editor and playable Phaser playground.

## 0.2.0

Interactive drawing, animation timeline, layers/palettes, history, saving and browser exports.

## 0.1.0

Deterministic TypeScript core, JSON schema, CLI, PNG/sheet exporters and preview.
