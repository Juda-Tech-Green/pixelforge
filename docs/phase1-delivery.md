# Phase 1 delivery and current repository

The Phase 1 foundation is implemented. The repository has subsequently reached software version 0.4.0; the canonical sprite document remains version 1.0. Later editor and game integration capabilities are preserved.

## Architecture and structure

The browser-independent TypeScript core validates JSON through Zod, converts palette-index arrays to independent runtime buffers, applies deterministic integer pixel operations, and renders straight-alpha RGBA. Browser Canvas and the Sharp PNG adapter consume the same raster output. Animation entries hold ordered frame references, durations and loop settings. The CLI applies operation batches to an independent clone and replaces output only after successful validation.

```text
apps/web/                  React/Vite editor and Phaser sheet demo
packages/core/             Schema, models, pixel/animation operations, renderer
packages/exporters/        Sharp PNG, sheet and game-bundle adapters
packages/cli/              Headless pixelforge command
packages/phaser/           Later-phase typed engine adapter
examples/coin/             16x16, six-frame spin and exported PNGs
examples/character/        32x32, four-frame walk and exported PNGs
examples/phaser/           Runnable fixed-sheet integration
examples/phaser-playground/ Later-phase playable integration
schemas/                   Project and operation JSON Schemas
tests/                     Headless tests, golden fixtures, external acceptance
docs/                      Architecture, APIs, formats, workflows and verification
.agents/skills/            Later-phase portable sprite-creation skill
```

## Run and verify

From the repository root, with Node 22.12+:

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

The web app runs locally without a backend. It loads the coin, imports canonical JSON, previews animations with nearest-neighbor scaling, and now also includes drawing and timeline editing. With its dev server running, `npm run smoke:browser` exercises the editor and real Phaser sheet loading.

These compiled CLI commands were executed successfully on 2026-10-30:

```sh
node packages/cli/dist/index.js init knight --width 32 --height 32 --output test-output/phase1-acceptance/knight.sprite.json
node packages/cli/dist/index.js validate examples/coin/coin.sprite.json
node packages/cli/dist/index.js inspect examples/character/character.sprite.json
node packages/cli/dist/index.js render examples/coin/coin.sprite.json --animation spin --frame 0 --output test-output/phase1-acceptance/frame.png
node packages/cli/dist/index.js export examples/coin/coin.sprite.json --format spritesheet --output test-output/phase1-acceptance/coin.png --columns 3 --padding 1
node packages/cli/dist/index.js apply examples/coin/coin.sprite.json --operations examples/coin/edits.json --output test-output/phase1-acceptance/updated.sprite.json
```

`npm run cli -- <command>` runs the equivalent source command. The package executable is named `pixelforge`. See cli-reference.md for options and operations-schema.md for structured batches.

## Results and limits

Strict type checking and all 57 Vitest tests across 12 files pass, including schema rejection, pixel boundaries, frame independence, ordering/timing, source-over compositing, decoded RGBA golden output, PNG transparency, sheet placement, deterministic output and atomic CLI failure behavior. The three Chrome suites pass: editor/sheet integration, game-metadata editing/export and playable Phaser runtime. Six installer/reference tests and the independent packed-package acceptance test also pass. The latter compiles a consumer and runs Phaser outside the monorepo using installed tarballs.

Tests were executed on Windows, Node 24.16.0, npm 12.0.2 and installed Chrome. Other operating systems were not executed. Core supports canvases from 1 to 1024 pixels per dimension and up to 256 palette entries; exports are capped at 64 megapixels. Fixed-cell sheets preserve transparent margins and are not trimmed. Individual output replacements are atomic, but a multi-file export is not a single filesystem transaction. No cloud persistence or layer blend modes are implemented. Public npm namespace rights and publication remain separate release gates; nothing was pushed or published.

## Phase 2 status

The requested Phase 2 follow-up is already implemented: drawing tools, layers, palette editing, timeline operations, onion skins, undo/redo and browser saving/export. Its user guidance is in editor-guide.md and keyboard-shortcuts.md. Future work includes broader platform and autonomous agent-host acceptance, larger-project performance work, selection/transform tools and additional export/engine options.
