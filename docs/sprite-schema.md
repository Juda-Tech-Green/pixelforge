# Sprite format 1.0

Files conventionally end in `.sprite.json`. Runtime validation is exported as `projectSchema` / `validateProject`; JSON Schema lives at `schemas/project.schema.json` (draft 2020-12).

```json
{
  "version": "1.0",
  "name": "Dot",
  "width": 2,
  "height": 2,
  "palette": [
    [0, 0, 0, 0],
    [255, 180, 40, 255]
  ],
  "layers": [{ "id": "base", "name": "Base", "visible": true }],
  "frames": [{ "id": "frame-0", "layers": { "base": [0, 1, 0, 0] } }],
  "animations": [
    {
      "name": "idle",
      "loop": true,
      "frames": [{ "frameId": "frame-0", "durationMs": 125 }]
    }
  ]
}
```

Coordinates use a top-left origin, x rightward, y downward, zero-based integers. Each layer grid is a dense row-major array of exactly `width * height` indices. Pixel `(x,y)` is at `y * width + x`. There is no second pixel representation. Width and height are integers 1–1024; every frame shares the canvas. Palette has 1–256 RGBA byte tuples; entry zero must be `[0,0,0,0]`. Other entries may have alpha from 0 to 255. An index must exist in the palette. Index zero is an explicit transparent pixel.

Layers are globally ordered bottom to top. IDs are unique and every frame must contain exactly those layer IDs, including hidden layers. Visibility is global. Rendering uses source-over alpha; there is no opacity or blend-mode field. Hidden layers do not render. Frames have unique stable IDs. Animations have unique names and at least one ordered reference with a positive integer duration of 1–3600000 ms. References may repeat and timing may differ between animations. `loop: false` holds the final frame after its duration; looping wraps at the total duration. Projects may have no animations, but must have a frame and layer.

Identifiers and names used as identifiers contain 1–128 characters. Project names contain 1–256. Unknown fields and versions are rejected, with paths in validation errors. Unknown-version documents are never silently migrated. Future tags and hitboxes may be stored under optional `metadata`, an object whose values are JSON; Phase 1 assigns no rendering semantics to that data.

Serialization writes root fields in this order: version, name, width, height, palette, layers, frames, animations, metadata (if present). Layer/frame/animation arrays retain their explicit order. Frame layer keys follow global layer order. Pixel and palette arrays retain order. Metadata preserves object insertion order. Two-space indentation and a final newline are used. Rendering is independent of object key order.

JSON Schema checks structural rules. Cross-field checks (grid area, palette bounds, matching layer keys, unique IDs, transparent entry zero, valid references) run in the Zod refinement, which JSON Schema cannot express in general for arbitrary canvas dimensions. Always run `pixelforge validate` after generating a document. See valid/invalid fixtures under `tests/fixtures/`.

## v0.2 compatibility

The interactive editor and expanded operation batches retain project version 1.0. Existing projects open without migration. Tools, viewport, active color/layer/frame, onion settings, playback and undo history are editor state only and are not serialized into the project. Saving uses the same canonical serializer as the CLI. Animation timing continues to belong to individual references, not source frames.

## Phase 3

metadata.pixelforgeGame is now reserved and validated against game.schema.json, version1.0, with runtime canvas/reference checks. Project format remains1.0. See collision-and-hitboxes.md for inheritance, coordinates and safe association updates.
