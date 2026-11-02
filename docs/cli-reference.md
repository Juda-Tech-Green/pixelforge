# CLI reference

Source invocation: `npm run cli -- <command>`. Compiled: `node packages/cli/dist/index.js <command>` after `npm run build`. Workspace package bin: `pixelforge`.

| Command       | Options and behavior                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| init NAME     | `--width 32 --height 32 --output NAME.sprite.json`; creates transparent base/frame-0 with a transparent/white palette                       |
| validate FILE | Validates JSON, version and all cross-field invariants; JSON success with name/version                                                      |
| inspect FILE  | Bounded summary by default; selectors and pagination are documented below                                                                   |
| render FILE   | `--animation NAME` optional; `--frame 0` selects zero-based animation entry, or project frame if no animation; required `--output FILE.png` |
| export FILE   | `--format spritesheet` (default), required `--output FILE.png`, optional `--columns N --padding N`; emits FILE.png and FILE.json            |
| export FILE   | `--format frames --output DIRECTORY`; emits `0.png`, `1.png`, etc., in project frame order                                                  |
| apply FILE    | Required `--operations OPS.json --output RESULT.sprite.json`; validates and atomically writes a complete batch result                       |

All commands are unattended: no prompts, overwrite confirmation or browser required. Output directories are created recursively. Existing named output files are replaced. Choose a separate output path to keep originals. Errors go to stderr; runtime errors are JSON `{ "ok": false, "error": "..." }`. Commander syntax/help errors use its standard text diagnostics. Failure exit status is nonzero. Successful command data is one JSON object on stdout (npm itself may also print script headers; invoke the built Node entry point for pure stdout).

## PixelForge manifest

The exporter writes `format: "pixelforge-manifest"`, version, project name, sheet width/height, frameWidth/frameHeight, columns, rows, padding, margin (0), ordered frame records `{ id,index,x,y,width,height }`, and animation records `{ name,loop,frames:[{ index,durationMs }] }`. PNG cell index is project frame array index. Animation order and timing come from project animation references. Sheets may contain transparent trailing unused cells. Use the actual frame count / endFrame to exclude them in Phaser. This is not a Phaser texture atlas JSON.

The output image should use a `.png` suffix; its companion manifest replaces that suffix with `.json`. An output path that would collide with its manifest is rejected. File-level atomic rename prevents partial project writes; a complete multi-file export is not a filesystem transaction.

## v0.2 agent editing

The CLI command surface is unchanged. apply now accepts animation, layer and palette structural operations as well as all original drawing operations. Batch version remains 1.0. See operations-schema.md for all fields and agent-workflows.md for a working animation-editing example. An operation schema or execution failure never replaces an existing output file.

## Phase 3

Phaser mode: export FILE --format phaser --output NEW_DIRECTORY --layout atlas|spritesheet --name SAFE_NAME --columns N --padding N --max-width N --max-height N --power-of-two. Layout defaults atlas, basename character, max sides2048. Unknown existing directories are rejected; --replace safely updates unchanged receipted bundles. Complete staged bundles publish by rename, with rollback on observed publish failure. Standard sheet/frames commands are unchanged. See game-asset-pipeline.md.

## Portable0.4 distribution

Install all four local release tarballs together; the exact cross-platform command is `node node_modules/@pixelforge/cli/dist/index.js`. The pixelforge bin is also available in local npm scripts. Workspace source paths are unnecessary after installation. Public registry publication is not performed; see release-checklist.md. Skill validators are documented in agent-validation.md.

## v0.5 agent and production commands

| Command                               | Implemented behavior                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| inspect FILE                          | --summary (default), --animation NAME, --frame ID, --layer ID, --game, --palette or --frames; one selector; --limit1..100 default25, --offset0+, --json                   |
| operations list                       | Enumerates the authoritative operation union; JSON                                                                                                                        |
| operations describe NAME              | Fields/required flags/JSON Schema/reference semantics; --example prints only a schema-valid operation; --json accepted                                                    |
| init NAME --palette FILE              | Optional RGBA tuple array, index0 transparent,1..256 entries; existing defaults retained                                                                                  |
| contact FILE --output FILE.png        | --animations comma-list, --prefix, --columns1..32, --scale1..16, --background transparent/checkerboard, --start inclusive/--end exclusive; labeled PNG plus .contact.json |
| check FILE --contract FILE            | Explicit semantic contract; separate structuralErrors/semanticViolations/visualWarnings/intentionalExceptions; violations exit1                                           |
| diff BEFORE AFTER                     | --summary/--json, --limit1..100; --preserve-frames IDs, --preserve-layers IDs, --preserve-game assert invariants, exit1 if violated                                       |
| export FILE --format phaser --replace | Verify managed output, stage/verify new files, backup/rename/rollback; reject unknown/modified files and links                                                            |
| build-assets --manifest FILE          | Hash source/batches/inputs/options/tool version, verify owned outputs, skip unchanged and safely rebuild stale assets                                                     |

Examples and exact output semantics: [large projects](large-projects.md), [contact](contact-sheets.md), [semantic checks](semantic-checks.md), [safe exports](safe-exports.md), [asset management](asset-management.md). There is no check-effects alias; configurable effects checks use check --contract. Runtime pixel errors include operation index, frame/layer, coordinates, canvas size and valid ranges. --replace only applies to Phaser bundles, not unrelated files or directories.
