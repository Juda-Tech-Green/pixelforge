# Game asset pipeline

Generate the reproducible character and both export layouts:

```sh
npm run examples
npm run assets:playground
npm run dev:playground
```

Open the Vite URL (normally port 5174). Move with A/D or arrows, jump with Space, attack with J, toggle debug with F3. The target reacts only when an active attack region intersects it. Debug draws the actual Arcade body and computed world combat regions. Ground and platform collisions use Arcade Physics.

Export another project through the CLI:

```sh
npm run cli -- export examples/phaser-playground/character.sprite.json --format phaser --layout atlas --name knight --padding 2 --max-width 256 --max-height 256 --output test-output/knight-bundle
```

Use `--layout spritesheet --columns 3` for fixed cells, or `--power-of-two` for an atlas. Output initially needs a new directory; subsequent CLI exports can use --replace for a verified managed bundle. Files are fully assembled and encoded before staging beside the destination. Publishing renames staging into place, with cleanup on failure. Managed replacement protects unexpected/modified files, stages new output, and rolls back observed publish failures; see safe-exports.md. Directory rename visibility/durability is filesystem/platform dependent and is not a power-loss transaction.

The bundle contains `bundle.json` (PixelForge loader contract), `knight.png`, `knight.atlas.json` for atlas mode (native Phaser), `knight.animations.json` (ordered names/references/timing), `knight.game.json` (frame mapping, source dimensions, validated game metadata), and README. Frame pixels are stored once. Animation timing lives only in the animation file; physics/events live only in the game file.

Browser Phaser export offers layout, safe basename, columns/padding, atlas maxima/POT and metadata inclusion. Its summary reports frame/animation count, texture dimensions, unused area and filenames. It downloads files separately using Canvas PNG encoding; allow multiple downloads and keep them together. No backend or ZIP dependency is needed. Browser and CLI metadata/raster assembly is shared; encoded PNG bytes may differ.

The character operation batch is `examples/phaser-playground/character.ops.json`, applied to the original character example by `scripts/playground-assets.ts`. It creates gameplay animations and metadata through the same agent API used by `pixelforge apply`.

## Production asset sets

Use build-assets --manifest pixelforge.assets.json to hash reproducibility inputs and rebuild only stale managed bundles. See asset-management.md for layout, freshness, runtime key stability and refusal behavior. Source documents/batches stay separate from runtime bundles and validation previews. Browser downloads remain individual files and do not receive a filesystem ownership receipt; export through the CLI for managed replacement.
