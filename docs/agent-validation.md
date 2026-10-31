# Agent validation

From the target repository:

```sh
node .agents/skills/pixelforge-sprite-creator/scripts/check-environment.mjs
node .agents/skills/pixelforge-sprite-creator/scripts/validate-project.mjs hero.sprite.json
node .agents/skills/pixelforge-sprite-creator/scripts/validate-export.mjs public/hero hero.sprite.json
```

Helpers resolve installed packages from the current directory and work when their script paths are elsewhere. CLI validation enforces canonical schema and game references. Project analysis renders through core, reports empty frames, opacity/bounds and unused source references; warnings do not fail or condemn intentional motion.

Export validation requires bundle.json and all referenced metadata/texture files, rejects path escapes, checks schemas/cross-file references, image budgets/dimensions, native atlas coordinates/nonoverlap and fixed sheet geometry. Supplying source JSON additionally compares every decoded source pixel. Without it the report explicitly warns that source equivalence was not requested. All errors return exit1 and JSON; success reports ok/errors/warnings/artifacts. JSON parsing alone is not sufficient validation.

Tests cover malformed input, corrupted atlas geometry, external package resolution and real game loading. `npm run test:skill` checks YAML, links, installer lifecycle/traversal/links, and reference reconstruction. `npm run test:external` performs a fresh offline tarball install and Chrome game check outside the workspace. It requires cached third-party dependencies and an existing Chrome binary (`PIXELFORGE_CHROME` overrides its path).
