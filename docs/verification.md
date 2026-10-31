# PixelForge v0.2 verification

Verified on Windows with Node 24.16.0 and npm 12.0.2:

- TypeScript strict checking across packages, web app, examples, scripts and tests.
- Vitest headless suite including schema fixtures, pixel operations, animation order/timing, layer source-over, decoded RGBA golden fixture, PNG alpha/dimensions, sheet positioning, deterministic bytes, CLI subprocesses, atomic failed batch preservation.
- Node package build and production Vite builds for the editor and separate Phaser demo.
- Phase 1 browser baseline (before editor replacement): exact Canvas RGBA compared with core output, zoom, frame selection, playback, invalid imports retaining current project, valid character import, mobile metadata/palette disclosure, no page overflow, large canvas origin scrolling, fitted thumbnails, real Phaser sheet and animation loading (six 16×16 frames, 8 FPS, 750ms, looping).
- Compiled CLI and workspace `pixelforge` bin, plus the README source CLI workflow.

Commands:

```sh
npm run typecheck
npm test
npm run build
npm audit
# In a second terminal while npm run dev is running:
npm run smoke:browser
```

The browser smoke uses an existing Chrome executable, configured by `PIXELFORGE_CHROME`; it does not download or install a browser. Regular tests do not need a browser or dev server. Screenshots in ignored `test-output/` are local review evidence, not source assets.

The optional Phaser entry bundles Phaser separately, so Vite warns about its large chunk; the main preview does not import Phaser. Zod dependency comments also produce harmless Rollup annotation warnings. Both builds finish successfully. No GitHub push or publication is performed.

## Editor verification

`npm run smoke:browser` now runs scripts/editor-smoke.ts (also available as npm run smoke:editor). It exercises real pointer input at DPR 2, exact pencil/line/rectangle/ellipse/fill output, eraser, layer-data picker, zoom, pan nonmutation, Escape cancellation, undo/redo, source-reference deletion rejection, entry removal/reordering/repetition, layer add/reorder/delete, palette editing/removal, saved JSON/reopen, invalid import preservation, onion boundaries/nonmutation, variable-duration nonlooping playback, browser frame/sheet decoded RGBA and manifest equality, worked agent batch import, mobile overflow and Phaser loading. It generates its own agent batch result and local screenshot evidence.

The headless suite now includes editor gesture/history, structural batch and thumbnail-cache tests alongside all original tests. Cache tests verify reuse across unrelated edits, invalidation and memory-budget behavior.

Known bounds: snapshot history defaults to 50 checkpoints / 32 MiB of retained serialized text, plus current/saved state; thumbnail cache is capped at 16 MiB. Large documents can remain costly. Browser multi-file downloads may require permission. No ZIP, cloud persistence, atlas packing, blend modes or selection/transform tools are included. These are outside the required Phase 2 scope.

Final v0.2 result: strict typecheck passed; 46 tests across seven files passed; expanded Chrome smoke passed; compiled CLI reports 0.2.0 and successfully applies/validates the animation batch; npm audit reports zero vulnerabilities. UI review disposition: ship after fixing native Space button activation and rectangular thumbnail aspect ratio. Build warnings are dependency annotations/directives and the separate Phaser demo's large chunk, not build failures. See phase2-audit.md for requirement-to-evidence mapping.

## Phase 3

Phase 3 checks: npm run smoke:game-editor passed origin undo/redo, snapped body move/resize, metadata save/reopen, browser native-atlas downloads, exact JSON and decoded pixel equivalence with Node bundle export. npm run smoke:playground passed generated atlas/sheet loading, animation duration mapping, Arcade rectangle/circle offsets/origins, movement/jump, active attack target reaction and debug toggle. Phase2 browser smoke also reran successfully. Unit suite currently57 tests; final full suite/build/audit recorded after completion audit.

Final v0.3 verification: strict typecheck passed; all 57 tests in 12 files passed (including every Phase1/2 test). All three Chrome suites passed: smoke:browser, smoke:game-editor and smoke:playground. Real gameplay probe measures120/220/180ms animation entry durations, validates atlas and sheet loading, configured rect/circle geometry, movement/jump and attack target. Compiled CLI reports0.3.0 and exported test-output/final-v03-bundle successfully. npm audit reports zero vulnerabilities. UI review disposition ship. Event-loop deduplication additionally tested against Phaser's update-before-repeat ordering. Native Phaser JSON Hash remains untrimmed; separate metadata formats and limitations are documented. Production builds cover Node packages, editor, original Phaser demo and new playground.

## Current verification — 2026-10-30

Software version 0.4.0, Windows, Node 24.16.0 and npm 12.0.2:

- `npm run typecheck`: passed.
- `npm test`: 57 tests in 12 files passed, retaining Phase 1–3 regression coverage.
- `npm run test:skill`: six tests passed, including reference reconstruction, YAML/resource links and protected installer lifecycle/path handling.
- `npm run test:external`: one full independent acceptance test passed. Local tarballs were installed in a temporary project outside the workspace; CLI construction/export, installed helpers, declaration compilation and real Phaser browser animation/body checks succeeded.
- `npm run build`: Node packages and both Vite applications built successfully. Dependency annotation/directive warnings and large Phaser bundle warnings remain nonfatal.
- `npm run smoke:browser`, `npm run smoke:game-editor`, `npm run smoke:playground`: all passed in installed Chrome with local dev servers.
- Compiled CLI init/validate/inspect/render/export/apply commands passed; exact commands and outputs are recorded in phase1-delivery.md and ignored test-output/phase1-acceptance/.
- `npm audit --omit=dev`: zero vulnerabilities. The earlier full development audit also reported zero.

Four local 0.4.0 package tarballs were built with compiled JavaScript, declarations, licenses and schemas. No publication or Git push occurred. Public namespace ownership is unverified. Windows toolchain acceptance does not establish macOS/Linux execution or autonomous skill activation in Codex/OpenCode/Antigravity. See phase4-audit.md and agent-compatibility.md for scope and host-specific limitations.
