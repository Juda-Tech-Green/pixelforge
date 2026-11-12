# One setup path for agents and game repositories

Use Node22.12+ (Node24 recommended). Start from the actual PixelForge GitHub repository, not an unrelated registry package:

```sh
git clone https://github.com/Juda-Tech-Green/pixelforge.git
cd pixelforge
npm ci
npm run typecheck
npm test
npm run pack:release
node scripts/verify-release.mjs release
```

This agent does not publish source: a GitHub clone can point at a different revision. Select the reviewed v0.7 development source snapshot/revision before running the build commands. This builds from that source without preexisting dist declarations. Release metadata contains seven versioned tarballs, SHA256SUMS and versioned release notes. To use a different reviewed revision, select it through your normal Git workflow before building. This run does not publish a release or establish npm namespace ownership. Historical v0.5 verification remains separate from [current audio verification](audio/verification.md).

## Install into an unrelated game

Copy the seven matching0.7.0 tarballs into a stable directory **inside your game**, such as `vendor/pixelforge/`. From that game:

```sh
npm install --ignore-scripts ./vendor/pixelforge/pixelforge-core-0.7.0.tgz ./vendor/pixelforge/pixelforge-exporters-0.7.0.tgz ./vendor/pixelforge/pixelforge-cli-0.7.0.tgz ./vendor/pixelforge/pixelforge-phaser-0.7.0.tgz ./vendor/pixelforge/pixelforge-audio-core-0.7.0.tgz ./vendor/pixelforge/pixelforge-audio-exporters-0.7.0.tgz ./vendor/pixelforge/pixelforge-geometry-0.7.0.tgz
node node_modules/@pixelforge/cli/dist/index.js --version
```

The normal path uses network access for third-party packages and respects project installation policy. Local tarballs do not contain Sharp, Commander, Zod or Phaser dependencies. `--offline` is optional and works only with a populated compatible npm cache; an uncached fresh machine needs online dependency resolution. Third-party install scripts are disabled above; platform-specific optional binaries must still be available through npm dependencies. Do not standardize on `--legacy-peer-deps`.

In PowerShell, use the same commands and quote paths containing spaces. Npm records portable `file:vendor/...tgz` archive references, rather than a `file:` dependency pointing to an unrelated sibling source checkout. Retain these local archives for reproducibility or use an approved artifact store; do not point consumers at a maintainer's machine. Phaser is a peer: inspect the host version before installing the adapter. Compatibility and exact executed versions are recorded in phaser-integration.md.

## Install and verify the skill

From the PixelForge checkout:

```sh
node .agents/skills/pixelforge-sprite-creator/scripts/install.mjs install --target /path/to/game/.agents/skills
node .agents/skills/pixelforge-sprite-creator/scripts/install.mjs verify --target /path/to/game/.agents/skills
node .agents/skills/pixelforge-audio-creator/scripts/install.mjs install --target /path/to/game/.agents/skills
```

Then from the game:

```sh
node .agents/skills/pixelforge-sprite-creator/scripts/check-environment.mjs
node .agents/skills/pixelforge-audio-creator/scripts/check-environment.mjs
node node_modules/@pixelforge/cli/dist/index.js inspect assets-src/hero.sprite.json --summary
```

Environment checking reports installed engine/adapter compatibility without importing the browser engine in Node. Skill installation is offline; the CLI installation is separate. See skill-installation.md for protected updates/uninstall and agent-compatibility.md for explicit optional global destinations.

## Integrity and reproducibility

Run `node scripts/verify-release.mjs /path/to/release` against the reviewed SHA256SUMS and archives. Hashes detect byte changes relative to that file; they do **not** authenticate a publisher, sign a release or provide provenance attestations. Obtain both files through a trusted channel. `npm run test:clean` snapshots source into an isolated temporary directory, installs dependencies and executes clean verification. Add `-- --offline` only with a warmed cache; add `-- --keep` to inspect the temporary snapshot.

Build instructions are reproducible steps, not a claim of independently reproduced byte-for-byte archives across all operating systems. No registry credentials or global installation is required.
