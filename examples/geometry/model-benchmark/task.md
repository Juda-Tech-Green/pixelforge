# Identical two-workflow evaluation task

Create four poses of the same 64×80 blue scout, using the exact palette, joint
hierarchy, bone lengths and proportions in `../standard/scout.rig.json`.
The character faces right. Do not change canvas, proportions or bone lengths.
Both ankles stay planted at their rest-pose world coordinates. The pelvis moves
by the following root translations while the right wrist reaches each target:

| Frame ID | Root translation | Right-wrist world target |
| --- | --- | --- |
| sample-0 | [0,0] | [47,24] |
| sample-1 | [1,.5] | [49,26] |
| sample-2 | [2,1] | [48,28] |
| sample-3 | [1,.5] | [46,27] |

Keep the chest/spine/head relationships and dimensions from the provided rig.
Left-arm pose is unconstrained apart from its lengths. No aesthetic score is
assigned automatically.

Also order every render part in `unordered.scene.json`. Keep all objects,
geometry, camera and transforms unchanged. Respect depth groups and render
layers. Table rear is behind character; table front and both table legs are in
front of character. Remaining ties use stable IDs.

## Output A: direct coordinates / existing pixel workflow

Write `direct.json` with:

```json
{
  "version":"1.0",
  "frames":[
    {"id":"sample-0","joints":{"pelvis":[32,42]},"headWidth":10,"headHeight":12}
  ],
  "sceneOrder":["floor","wall"]
}
```

Include all four frames, all 21 joint positions per frame, and every render-part
ID exactly once in sceneOrder. The example above is deliberately incomplete.
The evaluator draws these coordinates using the existing core pixel operations;
these are the actual drawing inputs, not detached self-reported annotations.
For this condition, do not import/call the new geometry/FK/IK/scene solver or CLI
commands. You may read the rig/scene JSON, use ordinary arithmetic or your own
math, and use the established sprite core. No external service.

## Output B: geometry-aware workflow

Write `geometry.poses.json` as poses1.0 referencing `scout-standard`, with the
same four frame IDs as pose IDs, the specified root translations and targets.
Use the actual v0.7 schema/CLI/API discovery. FK, IK and foot targets are allowed.
Write `geometry.scene.json` as scene1.0, adding explicit ordering dependencies
to the provided unordered scene without changing its geometry/transforms.

Keep raw outputs for both conditions. Do not revise them after seeing evaluator
metrics. Record brief methodology/limits in `notes.md`. Do not edit product code,
tests or the evaluator. This small, single-specification test cannot establish
general cross-model artistic superiority.
