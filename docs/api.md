# TypeScript API

Import from `@pixelforge/core`. All mutators return `void` except creation/copy functions, which return the new object. Projects are mutable; retain IDs rather than array offsets when referring to frames. Palette colors are `[r,g,b,a]` bytes. `Project` stores typed grids; `ProjectDocument` is JSON-compatible.

| Function                      | Arguments                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| createProject                 | `{ name, width, height, palette? }` → Project with `base` layer and `frame-0`       |
| createFrame                   | `(project, id)` → zero-filled Frame                                                 |
| createLayer                   | `(project, id, name = id)` → Layer; zero plane added to all frames                  |
| setPixel                      | `(project, frameId, layerId, x, y, paletteIndex)`                                   |
| getPixel                      | `(project, frameId, layerId, x, y)` → palette index                                 |
| clearPixel                    | `(project, frameId, layerId, x, y)`                                                 |
| drawLine                      | `(project, frameId, layerId, x0, y0, x1, y1, color)`                                |
| drawRect / drawEllipse        | `(project, frameId, layerId, x, y, width, height, color, filled = true)`            |
| floodFill                     | `(project, frameId, layerId, x, y, color)`                                          |
| copyFrame                     | `(project, sourceId, newId)` → independent Frame                                    |
| moveRegion                    | `(project, frameId, layerId, x, y, width, height, dx, dy)`                          |
| flipHorizontal / flipVertical | `(project, frameId, layerId)`                                                       |
| replaceColor                  | `(project, frameId, layerId, from, to)`                                             |
| clearFrame                    | `(project, frameId)`                                                                |
| removeFrame                   | `(project, id)`; referenced or last frame cannot be removed                         |
| reorderFrames                 | `(project, ids)`; complete unique permutation                                       |
| addAnimation                  | `(project, name, [{ frameId, durationMs }], loop = true)` → Animation               |
| addAnimationFrame             | `(project, name, frameId, durationMs, insertionIndex?)`                             |
| removeAnimationFrame          | `(project, name, index)`; last entry cannot be removed                              |
| reorderAnimationFrames        | `(project, name, indices)`; complete permutation of entry indices                   |
| setFrameDuration              | `(project, animationName, entryIndex, milliseconds)`                                |
| renameAnimation               | `(project, oldName, newName)`                                                       |
| animationFrameAt              | `(project, name, elapsedMs)` → timed AnimationFrame                                 |
| animationFrameIndexAt         | `(project, name, elapsedMs)` → animation entry index, including repeated references |
| getFrame / getAnimation       | `(project, idOrName)` → object; throws if absent                                    |
| renderFrame                   | `(project, frameId)` → `{ width, height, data: Uint8Array }` in RGBA order          |
| renderAnimationFrame          | `(project, animationName, entryIndex)` → Raster                                     |
| fromDocument                  | `(unknown)` → validated independent Project                                         |
| toDocument                    | `(project)` → validated independent ProjectDocument                                 |
| serializeProject              | `(project)` → canonical formatted JSON string                                       |
| cloneProject                  | `(project)` → validated independent Project                                         |
| validateProject               | `(unknown)` → ProjectDocument; throws ZodError                                      |
| applyOperations               | `(project, unknownBatch)` → validated independent Project                           |

`projectSchema`, `colorSchema`, `operationSchema`, `operationsSchema` and generated `projectJsonSchema` / `operationsJsonSchema` are public exports. Types include Project, ProjectDocument, Frame, Layer, Color, Animation, AnimationFrame and Raster.

From `@pixelforge/exporters` (Node only): `encodePNG(raster)`, `exportFramePNG(project, frameId)`, `renderSpriteSheet(project, { columns?, padding? })` → `{ raster, manifest }`, `exportSpriteSheet(project, options)` → Promise of `{ png: Buffer, manifest }`. PNG functions return promises. Frames are never trimmed. `columns` is 1–4096; padding is 0–1024; default is all frames horizontally with no spacing.

## v0.2 structural APIs

| Function           | Arguments                                                                 |
| ------------------ | ------------------------------------------------------------------------- |
| getLayer           | (project, id) → Layer, throws if absent                                   |
| renameLayer        | (project, id, name)                                                       |
| setLayerVisibility | (project, id, visible)                                                    |
| removeLayer        | (project, id); rejects final layer, removes every frame plane             |
| reorderLayers      | (project, ids); complete bottom-to-top permutation                        |
| removeAnimation    | (project, name); preserves source frames                                  |
| setAnimationLoop   | (project, name, loop)                                                     |
| addPaletteColor    | (project, RGBA) → appended palette index                                  |
| updatePaletteColor | (project, index, RGBA); index zero immutable                              |
| removePaletteColor | (project, index); rejects used/zero entries; safely remaps higher indices |

renderSpriteSheet and SheetOptions are now exported from core as well as the Node exporter. This shared function defines both browser and CLI layout and manifest. The browser's pngBlob adapter encodes its raster via Canvas without Sharp. All 17 structural operations are also available through applyOperations; their argument objects are documented in operations-schema.md.

## Phase 3

Phase 3 exports gameMetadataSchema, getGameMetadata/setGameMetadata, setSpriteOrigin, setCollisionBody/clearCollisionBody, addGameBox/updateGameBox/removeGameBox (both hitbox and hurtbox kinds), setAnimationEvent/removeAnimationEvent, setAnchor/removeAnchor, resolveGameBoxes and boxToWorld. renderAtlas returns raster/native JSON Hash metadata. assemblePhaserBundle returns raster, validated manifest, animationData, gameData, files and unusedArea. validateBundleMetadata checks cross-file invariants. Node exportPhaserBundle stages a new output directory. See phaser-integration.md for the separate adapter APIs.
