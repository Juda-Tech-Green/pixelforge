# Inspect and edit large sprite projects

The dense palette-index format remains1.0. Do not dump megabytes of raster JSON into an agent conversation. Execute locally:

```sh
pixelforge inspect hero.sprite.json --summary
pixelforge inspect hero.sprite.json --animation walk-front --limit 25 --offset 0
pixelforge inspect hero.sprite.json --frame walk-front-2
pixelforge inspect hero.sprite.json --layer aura
pixelforge inspect hero.sprite.json --game
pixelforge inspect hero.sprite.json --palette
pixelforge inspect hero.sprite.json --frames
pixelforge operations list
pixelforge operations describe drawRect
pixelforge operations describe setAnchor --example
```

All output is JSON (`--json` is accepted for inspect/discovery/diff). Default inspect is a compact summary: name/version, dimensions, frame/layer/palette counts, paged layer IDs/names/visibility, animation names/entry counts/total milliseconds/loop flags, game presence and on-disk source bytes. Select one view per invocation. Pages default25, maximum100, nonnegative offset; each list reports total/offset/limit/truncated. No dense pixels are printed. --palette returns indexed RGBA tuples and --frames lists source IDs, including unused sources. Selected frames include visible bounds, per-layer bounds and references; selected layers compute bounds only for the requested frame page. Game views include origin/body and paged anchors/boxes/events. Arbitrary event payloads are omitted; only bounded key summaries appear.

The canonical JSON must still be read, parsed and validated in full. Runtime memory scales with its source size; this release does not add a streaming or indexed file format. Summary avoids whole-project reserialization and raster rendering. A one-frame query still validates the whole document before computing selected bounds. The generated80-frame workload enforces default summary output under32KiB. Actual benchmark measurements appear in v0.5-verification.md.

## Targeted changes and preservation

```sh
pixelforge apply before.sprite.json --operations correction.ops.json --output after.sprite.json
pixelforge diff before.sprite.json after.sprite.json --summary --preserve-frames approved-front,approved-back --preserve-layers base --preserve-game
```

Diff reports counts and bounded lists: changed source frames/layers/index counts/bounds, palette indices, animation sequences/timing/loop, game/collision/origin/anchors/metadata and added/removed identifiers. It never prints individual pixel edits. `--limit` is1..100. Preservation assertions fail nonzero; other intentional changes are reported without failing. Pixel counts compare stored indices per layer, not composed-screen differences; a palette-only recolor is a palette change even when frame arrays stay identical.

Task policies: recolor preserves geometry/timing/references; expansion preserves approved assets; redesign allows intended artwork replacement while retaining the agreed gameplay contract; effect restoration protects unaffected layers and asserts explicit effect coverage; directional expansion preserves existing names and engine mappings. Choose invariants from the task, not a blanket prohibition on changing artwork.

Shared source frames affect all referencing entries. Inspect frame uses and diff warnings before sequence-specific edits. Use copyFrame, then explicitly remove/reinsert the intended animation entry referencing the copy. Metadata-bearing entry removal is guarded; migrate/remove its associations deliberately before changing references.
