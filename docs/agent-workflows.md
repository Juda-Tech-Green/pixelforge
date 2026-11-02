# Agent workflows

PixelForge accepts project and operation JSON from Codex, OpenCode, or any program that can write files. Existing format 1.0 projects and Phase 1 operations remain valid. No service or browser is needed for generation.

## Add a new animation to the coin

The checked-in `examples/coin/animate.ops.json` duplicates a source frame, paints a highlight, creates a named animation, inserts another source frame, changes timing, and reorders animation entries. Run:

```sh
npm run cli -- apply examples/coin/coin.sprite.json --operations examples/coin/animate.ops.json --output test-output/animated-coin.sprite.json
npm run cli -- validate test-output/animated-coin.sprite.json
npm run cli -- render test-output/animated-coin.sprite.json --animation sparkle-spin --frame 2 --output test-output/sparkle.png
```

Open the generated JSON with the editor's Open button, select `sparkle-spin`, and inspect its three entries. Their durations are 150, 90 and 250 ms in that order. Paint a pixel, preview, save the editable project, and export a sheet for Phaser. The original spin sequence and source file are preserved.

Operations run sequentially on an independent clone. Any invalid operation aborts the batch and leaves the destination unchanged. Source frame deletion rejects animation references; remove entries or their animation deliberately before deleting the source. Removing an animation entry does not delete its source frame. Reordering project source frames does not reorder animations.

Palette removal rejects used colors across every frame/layer, including hidden layers. Removing an unused color remaps higher indices so their displayed RGBA colors remain unchanged. Index zero is always reserved transparent.

## Phase 3

Phase 3 worked character: scripts/playground-assets.ts applies examples/phaser-playground/character.ops.json to the original character project, creating idle/jump/attack plus physics, anchors, events and a scoped attack region. Run npm run assets:playground, open examples/phaser-playground/character.sprite.json in the editor, modify metadata and export. npm run dev:playground loads the generated bundle. See game-asset-pipeline.md for verified CLI export commands.

## Portable skill

Install pixelforge-sprite-creator into the target .agents/skills directory using skill-installation.md. Six reusable scenarios live in examples/prompts. The original reference-scout fixture records a48px specification and reusable operation construction. Helpers validate through the target's installed CLI/core. The independent acceptance test proves packed toolchain/game execution, not autonomous host selection. See agent-compatibility.md for actual verification status.

## v0.5 default workflow

Discover → Inspect → Specify → Generate/Edit → Render → Review → Validate → Export → Integrate. Start from AGENTS.md and setup.md. Prefer inspect selectors over dense source reads, operations list/describe over source-code searches, and small batches over unrelated reconstruction. Use contact previews and semantic checks only for task-defined expectations, diff/preservation for agreed invariants, and build-assets or --replace for safe managed updates. See large-projects.md, contact-sheets.md, semantic-checks.md, safe-exports.md and asset-management.md. Schema validity, source/export equality, asset loading, actual rendering, gameplay and visual quality are distinct evidence levels.
