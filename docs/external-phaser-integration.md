# Independent Phaser acceptance

Build tarballs with `npm run pack:release`, then run `npm run test:external`. This creates a temporary repository outside PixelForge and installs all four tarballs plus Phaser3.90/Vite7.3.7, using normal online dependency resolution with install scripts disabled (PIXELFORGE_OFFLINE=1 explicitly requests cached offline mode). PixelForge dependencies are ordinary unpacked directories, not workspace links. Source folders and development-condition exports are excluded from tarballs.

The test installs/verifies the skill, creates a16px sprite through the installed CLI, applies a two-entry100/200ms animation/body batch, validates/renders/exports, and runs installed skill validators. Negative cases corrupt JSON/atlas coordinates and require nonzero machine-readable failure.

A fresh Vite/Phaser game uses ordinary package imports and generated assets. Chrome verifies source texture count, animation changes/timing, body size/offset and absence of runtime/loading errors. There are no source aliases or relative imports into PixelForge. The test harness uses this repository's browser driver only; the game runtime depends solely on its own node_modules and assets. Temporary server/browser/files are cleaned up.

This is toolchain acceptance on Windows, not proof of autonomous Codex/OpenCode/Antigravity skill discovery. Use the manual host acceptance procedure in agent-compatibility.md to test that separately. For your own game, install the same tarball set, copy the skill, generate a bundle into a fresh asset directory and use --replace for verified managed updates, and follow phaser-integration.md while preserving scene conventions.

The v0.5 engine matrix runs npm run test:engines. It installs independent Phaser3.90.0 and4.2.1 consumers, compiles actual adapter source against each engine, and runs WebGL loading of both atlas/sheet layouts, variable/nonloop timing, origins/body, anchors/boxes/flips, StaticBody sync and marker/completion restart behavior. Actual pass/fail evidence is in v0.5-verification.md; configuration alone is not proof.
