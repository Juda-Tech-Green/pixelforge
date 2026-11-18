# Semantic posing (v0.8.1)

Requires the matching 0.8.1 runtime/package set. `capabilities --json` reports the installed
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
overrides, hand IK, attachment. The returned pose has baked rotations and empty
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

World placement may still require authored coordinates. Semantic gaze and
joint-relative object placement are candidates for a future increment.

Antigravity acceptance was reported for slumped posture, automatic right-arm IK,
folder grip alignment, deterministic sandwich occlusion, editable sprite output,
capability discovery, doctor and PNG preview. The reported reached hand position
was approximately [41, 33] with negligible numerical residual. This is reported
acceptance evidence; the existing evaluation artwork was not regenerated.
