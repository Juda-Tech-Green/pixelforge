# Architecture

Data flows from JSON → Zod validation → runtime project → pixel operations → RGBA renderer → browser Canvas or Sharp PNG adapter.

`@pixelforge/core` contains no filesystem, Node APIs, React, DOM calls or Sharp. JSON stores ordinary number arrays; runtime frames store `Map<string, Uint8Array>`. Conversion creates independent buffers. One ordered global layer list defines every frame's planes and compositing order. Animation entries reference stable frame IDs, so changing project frame order cannot silently alter animations. Entry timing belongs to the animation reference, allowing the same frame to have different timing in different sequences.

Operations mutate an explicit project, frame and layer. No singleton state or randomness enters graphics. Direct pixel access fails on out-of-bounds coordinates. Shape rasterizers clip and overwrite palette indices, including zero. Move uses a snapshot, clears valid source pixels, then copies valid source cells to clipped destinations; overlap is safe. The renderer uses straight-alpha source-over, bottom to top, rounding each composite channel to the nearest byte. Fully transparent output has zero RGB. Opaque colors pass through exactly.

Core renderSpriteSheet assembles equal-size cells and the shared manifest. `@pixelforge/exporters` re-exports that function and uses Sharp only for encoding. Browser Canvas/Blob encoding consumes identical rasters. The CLI handles files, argument validation, JSON reports, and temporary-file replacement. `apply` validates the complete input schema before executing on a clone; serialization revalidates the result before any output write. Temp files are in the target directory so rename stays on the same filesystem. Atomic visibility does not imply power-loss durability; no fsync guarantee is made.

The web app imports core source through Vite, reads example/imported canonical JSON and paints the same RGBA bytes with ImageData. Playback is based on elapsed time, not accumulated timer delays. The preview runs entirely in the browser. Components isolate canvas drawing from workspace controls for later tools and timeline editing.

The root TypeScript build emits declarations and JavaScript, then copies package artifacts into each package's `dist`. Package exports select source for the `development` condition and compiled JavaScript by default. Source CLI commands explicitly select that condition; built Node commands need no TypeScript loader. Vite bundles core and React without any Node exporter dependencies.

The v0.2 editor isolates pointer drafts in Canvas.tsx and gesture.ts, copying only the active plane. React receives one committed project per gesture. EditorHistory holds immutable serialized checkpoints with entry/byte budgets and separate saved-state tracking. Viewport, tool, selection, onion and playback state remain outside the project. Structural mutations run on a clone through core APIs, then validate before history commit.

Timeline rasters use a 16 MiB content cache. It compares only visible planes and rendering metadata, preserving unchanged thumbnails across immutable project commits while invalidating palette, visibility, order, dimensions and pixel changes. The cache excludes onion skins and remains separate from canonical rendering. Hidden-layer edits need not invalidate the composed image. Per-component memoization avoids cache scans during playback.

## Phase 3

Phase 3 keeps game geometry/metadata validation, associations, atlas packing and bundle assembly in core. packages/phaser is a separate typed Phaser adapter (3.90.0 and4.2.1 independently verified in v0.5). Exporters encode shared rasters and stage new directories; browser Canvas encoding uses the same metadata files. A namespaced metadata extension preserves document 1.0. GameData/GameOverlay integrate with existing history; game movement belongs to the playground scene.

## v0.5 production reliability

Workspace-relative TypeScript source paths remove bootstrap dependency on dist while emitted package imports remain public bare names; tarball types/default maps point only at compiled output. Core analysis modules handle bounded inspection/discovery/diff/contracts without filesystem dependencies. Node exporters implement contacts and manifest builds, with ownership/hash-verified staged bundles and rollback. Host-specific game behavior stays outside core. See safe-exports.md for cross-platform rename/interruption limits and asset-management.md for freshness/ownership semantics.
