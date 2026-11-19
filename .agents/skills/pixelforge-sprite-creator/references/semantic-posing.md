# Semantic posing (v0.8.2)

Requires the matching 0.9.0 runtime/package set. `capabilities --json` reports the installed
semantic capabilities and postures; `capabilities --schema semanticPose` and
`--schema heldObject` expose the separate format 1.0 contracts. Existing rig,
pose, animation and sprite schemas retain their versions and behavior.

In the source checkout:

```sh
npm run cli -- doctor examples/semantic-pose/hold.semantic-pose.json --rig examples/semantic-pose/clerk.rig.json --library examples/semantic-pose/clerk.poses.json --object examples/semantic-pose/folder.object.json --json
npm run cli -- rig resolve-pose examples/semantic-pose/hold.semantic-pose.json --rig examples/semantic-pose/clerk.rig.json --library examples/semantic-pose/clerk.poses.json --object examples/semantic-pose/folder.object.json --json
```

Omitting `--out` is read-only. Add `--out resolved.pose.json --out-rig resolved.rig.json`
to save an ordinary pose and derived rig. Both are needed for a held prop; only a
pose is needed for bare posture/hand targets. Existing outputs require `--force`;
all input files are protected. In another game invoke the installed CLI instead.

Resolve order: apply/bake base-pose IK, posture, explicit rotation/facing/root
overrides, postured FK placement, hand IK, attachment, post-IK FK gaze, final
pose/rig validation. The returned pose has baked rotations and empty
targets so rendering does not reapply obsolete constraints. Overrides establish
the pre-IK pose; requested hand constraints take precedence on the arm joints.
Invalid overrides fail, posture is clamped with warnings at declared joint limits.

`neutral` preserves the base posture. `upright` blends torso roles toward the rig's
own rest rotations. `slumped` and `lean_forward` apply small local torso deltas,
scaled by strength 0..1. Positive lean is toward rig-local +X (mirrored by facing).
Defaults require standard humanoid spine → chest → neck and shoulder → elbow →
wrist chains. Use explicit `roles` for different names; missing anatomy is reported.
Default elbow bend is +1 right / -1 left in the existing solver convention;
an explicit hand bend overrides it. No joint positions or lengths are changed.

Coordinate targets must say `space: world` or `space: joint-local` with a joint ID.
Local coordinates are sampled after posture/overrides, before new hand IK.
Contacts name an existing selected base-pose IK target or supplied library animation
contact ID, whose positions are already world-space. Duplicate IDs are ambiguous;
contact intervals are not evaluated by this static resolver. No new rig contact
fields are inferred. Object anchors are object-local points transformed through
the object's declared world position/rotation.

A heldObject defines rigid ellipse/polygon/sprite shapes using existing rig shape
fields and the character's palette indices. Each shape's joint equals the object
ID, identifying its object-local origin. Anchors are independent of shape origins,
so a grip is not assumed to be [0,0]. No object geometry is fabricated. Sprite
resources must still be supplied to `rig render --asset ID=FILE`. Bone/articulated
props and mirrored world-oriented sprite props are unsupported in this increment.

An attachment defaults its primary hand target to the transformed grip anchor.
An explicit primary hand target takes precedence. The object is translated so its
grip exactly follows the reached wrist, preserving its declared world rotation;
an unreachable intended target remains visible in reach diagnostics. A secondary
grip names the other hand and another anchor on this positioned object; it may
remain unreachable and is reported, never stretched. Only one object is attached.

`sandwich` explicitly selects existing primary-hand palm and front-overlay shape
IDs. Only those shapes move to derived palm/object/front layers, inserted together
after their last original layer. All other layers retain their relative order;
later existing layers may still occlude the grip. Missing or unrelated front-hand
geometry fails. `body-only` explicitly places the prop after a chosen existing
layer and does not create an overlay. The source rig remains untouched. Prop
shapes are transformed into wrist-local coordinates; the result is an ordinary
editable rig. Reuse the derived rig/pose together for subsequent rendering.

```sh
npm run cli -- doctor resolved.pose.json --rig resolved.rig.json --json
npm run cli -- rig render resolved.rig.json --pose resolved.pose.json --output resolved.png --sprite resolved.sprite.json
npm run cli -- preview resolved.sprite.json --out preview.png --json
```

To animate later, explicitly author a compatible pose library for the derived rig
and use the existing `rig animate` workflow. This command does not create animation.
Contact-sheet preview requires ordinary sprite animations. Report structural
verification separately from actual PNG inspection and artistic quality.

## Optional gaze and relative placement (v0.8.2)

Current runtime/package versions are 0.9.0 and both extended schema versions remain
1.0. Query `capabilities --json` → `semanticPosing.extensions` and the live schemas.
All new fields are optional: omitting them preserves the v0.8.1 behavior, default
head angles, pose serialization and existing world-object transforms.

`gaze` accepts a target, `forward`, optional `strength` (default 1), and optional
`limits`. Targets are world coordinates (`type: coordinate, space: world`), a
named joint (`type: joint, id`), a semantic role (`type: role, role`), or an
object-local named anchor (`type: object-anchor, object, anchor`). Head anatomy
defaults to the actual `head` joint; `roles.head` maps other names. Role targets
include spine/chest/neck/head and left/right shoulder/elbow/wrist, using existing
torso and arm mappings. Missing anatomy or target references fail clearly.

Always declare the actual artwork's nonzero **head-local forward vector**;
`[1,0]` suits the supplied standard fixture, not every rig. There is no guessed
forward direction. FK transforms this vector through all parent rotations and
facing reflection. Gaze transforms its world target back through the inverse head
matrix and computes the shortest angular correction from the declared forward
vector. Pixel coordinates have +Y down; positive local radians rotate clockwise
before any mirrored facing transform. Head proportions/positions are unchanged.

Legacy gaze uses the pre-gaze head rotation as its interpolation baseline; strength 0..1
scales the shortest correction. The resulting local angle is clamped to the rig's
head limits intersected with optional gaze `limits: [min,max]` (radians). Clamping
reports `PF_GAZE_LIMIT` and retains the final angular error. `desiredAngle` and
`appliedAngle` are local head rotations, not world headings. Metadata also includes
target world position, head origin, local forward vector, initial/final world
directions and final direction error in radians. Legacy gaze changes the head only;
there is no eye/eyelid generation or gaze animation.

Explicit head rotations in the base library are interpolation baselines. An
explicit `overrides.rotations` entry on the same gaze joint conflicts and produces
`PF_GAZE_ROTATION_CONFLICT`; neither directive silently wins.

`attachment.placement` overrides the selected prop's transform for this request.
Both that field and heldObject `transform` accept:

- `space: world`, `position: [x,y]`, `rotation`: the original absolute world
  position and angle, unchanged from v0.8.1.
- `space: joint-local`, exactly one of `joint: ID` or `role: NAME`,
  `offset: [x,y]`, `rotation`: local translation followed by local rotation in
  radians. The full postured FK parent matrix composes with this rigid transform,
  so offsets rotate with the parent and mirrored facing is retained, including
  for all object anchors. Rotation is relative to the joint, never implicitly
  absolute. Local angles are bounded to [-pi,pi], as in existing geometry.

Placement is sampled **after posture and explicit overrides, before hand IK**.
It is not iteratively recomputed. The resulting grip anchor supplies hand IK;
afterward the prop shifts to follow the reached wrist, as before. Placement
metadata distinguishes the sampled world origin/grip from the actual attached
world origin/reached grip, and includes the source joint/role, local offset,
resolved rotation and final rigid matrix. A reflected matrix's rotation reports
the world direction of its +X axis; the matrix is authoritative for handedness.
Explicit primary hand targets retain their existing precedence over a grip target.

Gaze toward a held-object anchor uses the **final attached** prop transform,
including any reach-induced shift. Named joint/role gaze targets use post-IK FK.
No hand IK is rerun after gaze. Placement references inside an active solved arm
or the gaze-head subtree, head targets in that head subtree, or a head mapping
that would move constrained hands/base targets are rejected with
`PF_SEMANTIC_CYCLE`. Use a stable chest reference or an independent world target;
there is no iterative constraint solver. Unreachable grips still report the
existing actionable hand diagnostics, without stretching limbs.

The small `gaze-relative.semantic-pose.json` example slumps, positions the existing
folder relative to the chest, solves the right hand, then directs the head at its
named `support` anchor with existing sandwich ordering. It requires no head,
shoulder or elbow angle and no absolute folder position:

```sh
npm run cli -- rig resolve-pose examples/semantic-pose/gaze-relative.semantic-pose.json --rig examples/semantic-pose/clerk.rig.json --library examples/semantic-pose/clerk.poses.json --object examples/semantic-pose/folder.object.json --json
```

Without output flags this remains read-only. For editable outputs use existing
`--out` and `--out-rig`, run doctor with the derived rig, then rig render and PNG
preview as above. No new renderer, animation or contact sheet is required.
Generate only the affected JSON Schemas with
`npm run schemas -- semanticPose heldObject`; omitting names retains full generation.

## Opt-in anatomical gaze (v0.8.2)

Use `gaze.mode: anatomical` when exact head-to-target alignment would require an
extreme rotation and harm the readability of a small pixel-art face. Omitted mode
and explicit `legacy` preserve the original head-only solver and strength default
exactly. Anatomical behavior is never selected automatically. Query live modes,
profile defaults and schema fields through capabilities; format versions stay 1.0.

Anatomical mode requires a direct existing neck → head chain (`roles.neck` and
`roles.head` support custom names). The declared head-local `forward`, postured
base orientations, parent rotations and mirrored facing continue to define the
geometric correction. Only neck and head rotations change; hand IK and the held
object are not recomputed or moved. Neck-descendant gaze/placement targets or
constraints that would introduce a dependency cycle fail explicitly. Explicit
overrides on either controlled joint conflict; base-library angles remain valid
starting orientations.

Optional `gaze.anatomy` fields are `neckWeight`, `headWeight`, `neckLimits` and
`headLimits`. Weights are finite 0..1, normalized by their positive sum. Zero
weight disables correction/spill allocation to that joint, although an already
out-of-profile starting angle is still clamped. Limits are absolute local joint
angles in radians, not delta limits; increasing intervals are intersected with
the rig limits and existing gaze `limits` on the head. Tighter rig restrictions
always win. A profile with legacy mode is an error, not an ignored suggestion.

Defaults for the exact standard humanoid skeleton are weights 0.4 neck / 0.6 head,
neck limits [-0.2,0.2] and head limits [-0.35,0.35] radians. These are conservative
PixelForge presentation choices, not universal human anatomy. Standard detection
compares canonical joint IDs, parents and rest positions, independent of artwork
and asset filenames. Other skeletons must provide explicit limits or meaningful
rig limits for both joints; a default unrestricted [-pi,pi] interval does not
justify a human profile. Custom named anatomy is never silently classified human.

The solver computes a shortest signed correction via inverse head FK, scales it
by strength, divides it by normalized weights and clamps each allocation. One
fixed spill pass tries the head and then neck for remaining correction, skipping
zero-weight joints. After FK updates the moved head origin, one analytical head
correction accounts for parallax (with the same strength goal and limits). There
is no iterative whole-body search. The head may absorb this small correction
beyond its initial weight share. The final pose is bounded even when exact
alignment is unavailable within this allocation.

`gaze.anatomical` metadata includes the requested target, initial correction and
head origin, normalized weights, source of limits, each joint's initial/final
rotation, applied delta, effective limits and limit-hit flag. `gaze.headOrigin`
is the final origin; `directionError` and `renderedDirectionError` report the
actual final head-direction error after recomputing FK. In anatomical mode the
common `desiredAngle` is the initial unconstrained head-only angle; the applied
neck/head values in anatomical metadata describe the actual distributed result.
Residual reasons distinguish joint limits, partial strength and bounded allocation.

`PF_GAZE_LIMIT_REACHED` and `PF_GAZE_TARGET_UNREACHABLE` are warnings, allowing a
useful bounded pose with an honest residual. Accept the composition or reposition
the target rather than increasing limits blindly. Unavailable anatomy and invalid
profiles produce actionable errors. No zero-error claim substitutes for visible
alignment. Eye aim is deferred: eye pixels, eyelids and facial geometry remain
unchanged, and no theoretical eye contribution is reported.

Compare the existing full-strength legacy request with the new bounded request:

```sh
npm run cli -- rig resolve-pose examples/semantic-pose/gaze-relative.semantic-pose.json --rig examples/semantic-pose/clerk.rig.json --library examples/semantic-pose/clerk.poses.json --object examples/semantic-pose/folder.object.json --json
npm run cli -- rig resolve-pose examples/semantic-pose/gaze-anatomical.semantic-pose.json --rig examples/semantic-pose/clerk.rig.json --library examples/semantic-pose/clerk.poses.json --object examples/semantic-pose/folder.object.json --json
```

For a fresh preview, add `--out anatomical.pose.json --out-rig anatomical.rig.json`,
then use existing `rig render` to an ordinary sprite and `preview` to a new PNG.
Inspect the actual image when image-reading tools exist; this solver does not
establish aesthetic quality. Do not overwrite earlier Antigravity evaluation media.

## Diagnostics and reported v0.8.2 acceptance

| Code | Meaning and action |
| --- | --- |
| PF_GAZE_LIMIT_REACHED | Neck/head reached a profile or rig limit; inspect the residual before revising limits. |
| PF_GAZE_TARGET_UNREACHABLE | Applied bounded gaze retains rendered error; accept it or reposition the target. |
| PF_GAZE_FORWARD_MISSING | Supply a nonzero head-local forward reference matching the artwork. |
| PF_GAZE_ROTATION_CONFLICT | Remove conflicting explicit head/neck rotation overrides or omit gaze. |
| PF_PLACEMENT_JOINT_MISSING | Select an existing joint or correct its role mapping. |
| PF_SEMANTIC_CYCLE | Use a stable torso reference or independent target outside controlled branches. |

Zero direction error is geometric evidence, not proof of visually convincing pixel
art. User-provided Antigravity evaluation reported that the folder followed the
chest, hand IK maintained contact, gaze followed the object, and occlusion stayed
stable without manual world-position or head-angle calculations.

An identical-pose legacy/anatomical comparison reported head angles 1.33945/0.35
rad, anatomical neck 0.20 rad, visible direction errors 0/0.90167 rad, and unchanged
hand residual approximately 7.1e-15 px. Facial readability and neck continuity were
reported as preserved. The supplied verdict was PASS — Ready for release
preparation. These are user-provided acceptance results; evaluation artwork is
preserved locally and is not an approved release fixture.

Limitations remain static posing, one rigid prop, a direct neck/head chain for
anatomical mode, no full-body optimizer, automatic eye-pixel animation, animation
generation or articulated props. Unsupported cycles and sprite reflections remain
rejected. Preview with the existing rig/sprite pipeline before assessing aesthetics.

Antigravity acceptance was reported for slumped posture, automatic right-arm IK,
folder grip alignment, deterministic sandwich occlusion, editable sprite output,
capability discovery, doctor and PNG preview. The reported reached hand position
was approximately [41, 33] with negligible numerical residual. This is reported
acceptance evidence; the existing evaluation artwork was not regenerated.
