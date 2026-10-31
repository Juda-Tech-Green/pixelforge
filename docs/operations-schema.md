# Operation batches

`schemas/operations.schema.json` is generated from exported `operationsSchema`. Unknown operation names and fields are errors. The file is an object with `version: "1.0"` and an `operations` array (at most 100000 entries). The array is evaluated in order on a clone. Failure returns no new project and the CLI writes nothing.

```json
{
  "version": "1.0",
  "operations": [
    {
      "op": "drawRect",
      "frame": "frame-0",
      "layer": "base",
      "x": 2,
      "y": 2,
      "width": 8,
      "height": 8,
      "color": 1,
      "filled": true
    },
    { "op": "copyFrame", "source": "frame-0", "id": "frame-1" },
    {
      "op": "setPixel",
      "frame": "frame-1",
      "layer": "base",
      "x": 3,
      "y": 3,
      "color": 0
    }
  ]
}
```

| op                            | Fields after `op`                                                 |
| ----------------------------- | ----------------------------------------------------------------- |
| setPixel                      | frame, layer, x, y, color                                         |
| clearPixel                    | frame, layer, x, y                                                |
| drawLine                      | frame, layer, x0, y0, x1, y1, color                               |
| drawRect / drawEllipse        | frame, layer, x, y, width, height, color, filled (optional; true) |
| floodFill                     | frame, layer, x, y, color                                         |
| copyFrame                     | source, id                                                        |
| createFrame                   | id                                                                |
| createLayer                   | id, name (optional; defaults to id)                               |
| moveRegion                    | frame, layer, x, y, width, height, dx, dy                         |
| flipHorizontal / flipVertical | frame, layer                                                      |
| replaceColor                  | frame, layer, from, to                                            |
| clearFrame                    | frame                                                             |

`color`, `from`, and `to` are palette indices. IDs reference existing runtime objects except new `id` fields. Coordinates are safe integers within ±1000000; shape and region widths/heights are 1–1024. Direct pixel reads/writes and flood-fill seeds must be on canvas. Shapes clip. Lines include endpoints and use integer Bresenham rasterization. Ellipses use the integer cell-center predicate `(2i+1-w)²h² + (2j+1-h)²w² ≤ w²h²`; outlines keep cells adjacent to a nonmember in the four cardinal directions. Rectangles use width/height extents, including both first and last occupied cells.

All writes replace indices, including transparent zero. Flood fill is four-connected and restricted to the original palette index. Move takes a source snapshot, clears the source intersection with the canvas, then copies valid source cells to `(x+dx,y+dy)` with destination clipping. Transparent source cells overwrite destination cells. Off-canvas source cells do not create destination writes. Flips affect the full specified layer; replacement affects one specified frame/layer. `clearFrame` clears every layer. Copy makes independent arrays and does not add animation references automatically.

The operation file exposes graphics edits and structural animation, frame, layer and palette editing. All batch errors identify the zero-based operation index when execution fails; schema errors identify the corresponding input path.

## Structural operations (v0.2, batch format remains 1.0)

| Operation              | Fields                                             |
| ---------------------- | -------------------------------------------------- |
| addAnimation           | name, frames: [{frameId,durationMs}], loop? (true) |
| renameAnimation        | name, newName                                      |
| removeAnimation        | name                                               |
| addAnimationFrame      | name, frameId, durationMs, index? (append)         |
| removeAnimationFrame   | name, index                                        |
| reorderAnimationFrames | name, indices (complete permutation)               |
| setFrameDuration       | name, index, durationMs                            |
| setAnimationLoop       | name, loop                                         |
| removeFrame            | id                                                 |
| reorderFrames          | ids (complete permutation)                         |
| renameLayer            | id, name                                           |
| removeLayer            | id                                                 |
| reorderLayers          | ids (bottom to top, complete permutation)          |
| setLayerVisibility     | id, visible                                        |
| addPaletteColor        | color: [r,g,b,a]                                   |
| updatePaletteColor     | index, color: [r,g,b,a]                            |
| removePaletteColor     | index (unused, nonzero)                            |

Animation durations are positive integer milliseconds up to 3600000. All structural operations use the same core invariants as the editor. A final frame, final layer, or final animation entry cannot be removed; the animation itself can be deleted. Referenced source frames cannot be deleted. Palette removal rejects used colors and remaps higher indices without changing their colors. See agent-workflows.md for a complete animation batch.

## Phase 3

Phase 3 batch additions: setSpriteOrigin {origin:{x,y}}, setCollisionBody {body}, clearCollisionBody {}, addGameBox {box}, updateGameBox {id,box}, removeGameBox {id}, setAnimationEvent {event}, removeAnimationEvent {id}, setAnchor {anchor}, removeAnchor {id}. box.kind chooses hitbox/hurtbox, avoiding parallel redundant operations. Records use stable IDs and explicit scopes; schemas/game.schema.json specifies geometry and references. All mutations remain clone/validate/commit transactional.
