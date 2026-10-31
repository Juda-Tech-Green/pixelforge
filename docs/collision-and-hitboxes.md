# Collision, combat regions and coordinates

Project format stays 1.0. `metadata.pixelforgeGame` is a validated extension with its own `version:"1.0"`, normalized origin, optional body, boxes, anchors and events. Old metadata-free files remain valid. JSON Schema for the extension is `schemas/game.schema.json`; runtime validation additionally checks bounds and references.

Collision body is one project-wide rectangle `{type:"rectangle",x,y,width,height}` or circle `{type:"circle",x,y,radius}`. Circle x/y is its top-left bounding-box offset. All geometry uses integer original untrimmed canvas pixels. The body must fit the canvas. Anchors may lie on the canvas edge. Origin is normalized 0–1, independent from pixel offsets.

Hitboxes deliver attacks; hurtboxes receive them. They are custom rectangles, not automatically allocated Arcade bodies. Each has stable id, name, kind, enabled flag, rectangle and scope. Scopes are project, animation name, source frame ID, or animation name + entry index. Resolution overrides matching kind/name in order project < animation < frame < entry. Disabled specific records suppress inherited regions. Array order deterministically breaks equal-specificity ties.

Animation insertion/reorder remaps entry-scoped boxes, anchors and events; rename updates animation references. Deleting referenced source frames, animations or entries is rejected until metadata references are removed. Source-frame duplication copies pixels only; source metadata is not implicitly duplicated. Default collision bodies stay stable to avoid physics jitter.

`boxToWorld` accounts for untrimmed dimensions, origin, horizontal/vertical flip and scale (including nonuniform/negative scale). Returned axis-aligned dimensions are positive. Rotation is rejected. Circle Arcade bodies under nonuniform scale are not guaranteed circular; use uniform positive scale for physics. Texture trimming is intentionally absent, so all exported body/box offsets share one source coordinate system.

In the editor, Game Data supplies numeric controls and scope selection, enabled flags, anchors and entry event markers. Overlays distinguish green collision, red attacks and blue hurt regions. Enable Edit geometry on canvas to drag or resize at integer pixel increments. Turn off overlapping overlay types to manipulate a covered region. Geometry edits are undoable. Overlays never enter texture PNGs.
