# PixelForge agent entrypoint

PixelForge creates editable pixel sprites and Phaser assets. Use the portable skill at `.agents/skills/pixelforge-sprite-creator/SKILL.md`; install the complete folder into the target game's supported skills directory using its `scripts/install.mjs` with an explicit `--target`. Detailed setup: `docs/setup.md`.

For procedural sound effects use `.agents/skills/pixelforge-audio-creator/SKILL.md` and `docs/audio/README.md`. Audio uses separate sound format1.0 and the `audio` CLI command group.

For rig-driven characters or spatial scenes, read `.agents/skills/pixelforge-sprite-creator/references/geometry.md`. The `rig` and `scene` groups require the matching0.7.0 package set and generate ordinary editable sprite1.0 assets.

## In this checkout

Use Node22.12+ and npm. `npm ci` installs dependencies; `npm run cli -- --version` invokes source without prebuilt declarations. `npm run typecheck`, `npm test`, `npm run build` verify changes. Core stays independent of Node filesystems, React, Sharp and Phaser. Document/game format1.0 is backward compatible; software version0.7.0.

## In another game

Build/verify local artifacts with `npm run pack:release` and `node scripts/verify-release.mjs release`. Install the matching core/exporters/cli/phaser/audio-core/audio-exporters/geometry tarballs together; see setup.md for relocatable paths and online/offline behavior. Do not install an unrelated similarly named registry package or force incompatible peers. Run `node <installed-skill>/scripts/check-environment.mjs` from the game directory. The exact CLI is `node node_modules/@pixelforge/cli/dist/index.js`; local npm scripts can use `pixelforge`.

1. Discover the host engine/version, existing asset layout and stable runtime keys. Use `operations list` / `operations describe drawRect --example` for exact syntax.
2. Use `inspect FILE --summary` and selectors `--animation NAME`, `--frame ID`, `--layer ID`, `--game`; paginate with `--offset`/`--limit`. Do not read an entire dense sprite file into agent context.
3. Specify task invariants, then `init NAME --palette PALETTE.json --output FILE` or `apply FILE --operations OPS --output UPDATED`. Shared sources affect every referencing animation; duplicate/retarget first for sequence-specific edits.
4. `render FILE --output preview.png`; `contact FILE --animations idle,walk --output contact.png`. Inspect actual previews when tools permit; otherwise report structural-only verification.
5. `validate FILE`; `check FILE --contract expectations.json`; `diff BEFORE AFTER --summary --preserve-game`. Semantic expectations are task-defined, not aesthetic guarantees.
6. `export FILE --format phaser --output OUTPUT` creates a managed bundle; `--replace` updates verified unchanged managed output. Never delete output directories as the normal rebuild step. `build-assets --manifest pixelforge.assets.json` skips fresh bundles and rebuilds stale managed assets.
7. Integrate using `docs/phaser-integration.md` and run the consumer's loading/browser/gameplay checks. Distinguish schema/pixel equality/loading/rendering/gameplay/visual-review evidence.

Keep editable sources, batches and generator inputs. Do not publish, push or commit without the user's authorization. Preserve unrelated files and changes. See `docs/v0.5-progress.md` for release work still pending; CI configuration is not proof a platform passed.
