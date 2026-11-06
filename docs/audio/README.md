# PixelForge v0.6 procedural audio

PixelForge now has separate editable sound projects alongside sprite projects.
The DSP core contains no filesystem, React, Phaser, network or Web Audio imports.
CLI and browser share that offline renderer; browser playback only consumes its
PCM. Audio format 1.0 does not modify sprite/game format 1.0.

## Run

```sh
npm ci
npm run dev
```

Open `/audio.html` for the editor or `/audio-game.html` for the five-sound Phaser
sampler. The sprite editor remains at `/`. Audio requires a user click to play.

```sh
npm run cli -- audio create laser-shot --preset laser-shot --output test-output/laser.sound.json
npm run cli -- audio inspect test-output/laser.sound.json --metrics
npm run cli -- audio validate test-output/laser.sound.json --render
npm run cli -- audio render test-output/laser.sound.json --output test-output/laser.wav
npm run cli -- audio export test-output/laser.sound.json --output test-output/laser-bundle
npm run cli -- audio operations list
npm run cli -- audio operations describe setFrequency
npm run cli -- audio apply test-output/laser.sound.json --operations .agents/skills/pixelforge-audio-creator/examples/laser-edit.ops.json --output test-output/laser-edited.sound.json
```

`render` writes a WAV file. `export` writes a managed directory containing WAV,
editable definition, `audio.json` and a hash receipt. Existing output requires
`--replace` and verification of unchanged owned files; unexpected files block
replacement. Failed operations preserve source/output. JSON inputs are limited
to 1 MiB. Render rejects attempts to overwrite its definition with WAV bytes.

## Modules and references

- `packages/audio-core`: Zod schema, oscillators, envelopes, noise, ODEs, effects,
  modulation, mixing, rendering, presets, manifests and atomic in-memory edits.
- `packages/audio-exporters`: pure PCM16 WAV encoder and bundle assembly.
- `packages/cli/src/audio*`: CLI registration, filesystem staging and ownership.
- `apps/web/src/audio-editor`: React workspace, render worker and Phaser sampler.
- `packages/phaser`: audio loading and existing sprite-event sound mapping.
- [Mathematical semantics, limits and research](../../.agents/skills/pixelforge-audio-creator/references/sound-model.md).
- [Portable skill and workflow](../../.agents/skills/pixelforge-audio-creator/SKILL.md).
- [Phaser integration and troubleshooting](../../.agents/skills/pixelforge-audio-creator/references/integration.md).
- [Original demos, parameters and reproduction](../../examples/audio/README.md).
- Generated schemas: `schemas/sound.schema.json`, `audioOperations.schema.json`,
  `audioManifest.schema.json`. Relational/resource rules also run in Zod;
  JSON Schema alone cannot express all those checks.

## Verification commands

```sh
npm run typecheck
npm test
npm run examples:audio
npm run verify:audio
npm run smoke:audio
npm run pack:release
npm run verify:release
npm run test:external
npm run test:engines
```

`smoke:audio` needs the Vite dev server at 127.0.0.1:5173 and Chrome; override
`PIXELFORGE_CHROME` for a different executable. Independent decoding tests use
Python 3's standard `wave` module. See [verification](verification.md) for executed
results and limits. CI configuration alone is not evidence of a platform passing.

## Limitations and migration

Mono PCM16 only. No arbitrary DSP graphs, circuit calibration, adaptive ODE
solver, coupled-oscillator network, MP3/Ogg, spectrogram or automatic loudness
normalization. Triangle is not band-limited; nonlinear oversampling reduces but
does not eliminate aliasing. Effects tails stop at the defined project duration.
The final fade prevents endpoint jumps but does not replace listening review.

Software v0.6.0; sound schema 1.0. Unknown versions reject explicitly. A future
schema migration must produce a new validated document while preserving the
original, with a named source/target migration and regression fixtures. No
migration is necessary for the initial sound schema. Style DNA remains deferred.
