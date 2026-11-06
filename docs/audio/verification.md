# v0.6 implementation and verification

Executed locally on Windows, Node 24.16.0, Python 3.14.5 and Chrome
156.0.8078.80 on 2026-11-05. This report covers the current local v0.6
implementation, not publication or remote CI results. Existing v0.5 verification
and unrelated worktree changes are preserved separately.

## Implemented scope

The audio-core and audio-exporters workspaces provide strict sound format 1.0,
five oscillator waveforms, seeded white/filtered noise, stable per-voice random
streams, linear/exponential sweeps, ADSR/control-point envelopes, amplitude
modulation, mixing, analytic damped oscillators, bounded nonlinear RK4, modal
resonators, low/highpass, feedback delay, four distortion models, explicit output
clipping/fades, mono PCM16 WAV and stable-key manifests.

CLI audio create/inspect/validate/render/export/apply and operation discovery
work from source and packed artifacts. The browser has a separate audio workspace,
worker rendering, waveform axes/playhead, voice/effect editing, ordered effects,
play/stop/replay, import/save/WAV download, diagnostics, unsaved-change protection
and preserved JSON drafts. `/audio-game.html` is a separate five-effect Phaser
sampler; existing playground gameplay was not changed.

The Audio Creator skill includes installation, capability/version checking,
mathematics, five recipes, integration and troubleshooting. Independent consumer
installation exercised its installed check script. Codex/OpenCode/Antigravity
discovery requires each host's configured skills directory; host UI activation
was not executed or claimed.

## Executed checks

| Command/check | Evidence |
| --- | --- |
| v0.5 baseline `npm test` | 18 files, 70 tests passed before audio edits |
| `npm run typecheck` | Passed after audio/editor/demo changes |
| `npm test` | 23 files, 102 tests passed, including all original tests |
| Python standard `wave` independent decoder | PCM16 format, mono, sample rate, count and signed quantization verified |
| `npm run verify:audio` | All five generated WAVs independently decoded; RIFF sizes, channels, rate, sample count, nonzero signal and zero endpoints verified |
| `npm run build` / `npm run pack:release` | Browser, worker, playground and six local tarballs built |
| `npm run verify:release` | Six archives/checksums verified; no publisher authentication implied |
| `npm run test:external` | 1 independent packed install passed, including audio creation/validation/export and installed audio skill check |
| `npm run test:engines` | 2 independent typed/WebGL consumers passed: Phaser 3.90.0 and 4.2.1 |
| Phaser audio evidence | WAV loaded into audio cache, user-gesture AudioContext activation, sprite marker mapped once, analyser peak >.001 |
| `npm run test:skill` | 8 lifecycle checks passed, including the original 7 and the new audio skill |
| `npm run test:clean` | Fresh isolated install, typecheck, all 102 tests, builds, six-package pack, 8 skill tests and integrity verification passed |
| `npm run smoke:browser` | Existing sprite editor pixels/tools/history/import/export/mobile regression passed |
| `npm run smoke:game-editor` | Existing game metadata and atlas bundle/pixel regression passed |
| `npm run smoke:audio` | All five renders, playback, editing, WAV/save/reopen, draft/dirty safeguards, mobile axes/overflow and Phaser sampler passed |
| UI review | Independent review found three issues; all fixed and confirmed resolved in the bounded verdict pass |
| Design detector | Executed once; no findings (`[]`) |

The first clean check exposed a test-launcher dependency on existing `dist`.
The audio CLI test now uses Node's `--import` tsx loader with the development
condition, rather than a tsx subprocess that lost that condition. The subsequent
clean snapshot passed all steps: install, typecheck, 102 tests, build, pack,
8 skill checks and integrity verification. An initial sampler assertion also raced the
async context activation; it now waits for the actual Playing state.

Browser captures/results are local artifacts under `test-output/audio-browser`.
They include desktop 1440px and mobile 390px. Functional smoke uses the Vite dev
server at 127.0.0.1:5173. A real audio-device or subjective listening review was
not performed; browser playback and nonzero analyser output are distinct evidence.

## Numerical consistency

All five same-runtime renders and WAV exports repeat exactly in tests. Comparing
all PCM samples between Node and Chrome gave maximum absolute differences:

| Sound | Maximum PCM difference |
| --- | --- |
| laser-shot | 0 |
| gunshot | 0 |
| zombie-growl | 1.1102230246251565e-16 |
| metal-impact | 1.1102230246251565e-16 |
| altar-activation | 5.551115123125783e-17 |

These are separate V8 runtime configurations, not a Firefox/Safari portability
claim. Cross-engine transcendental math may differ. The same-runtime byte contract
does not promise byte equality between every JavaScript engine.

## Representative performance and assets

Single local measurements from `npm run examples:audio` (not latency guarantees):

| Sound | Duration | Render ms | Peak / RMS | WAV bytes |
| --- | --- | --- | --- | --- |
| laser-shot | 400 ms | 7.90 | .2600 / .0876 | 35,324 |
| gunshot | 400 ms | 8.46 | .5187 / .0652 | 35,324 |
| zombie-growl | 1400 ms | 59.87 | .5146 / .1514 | 123,524 |
| metal-impact | 1200 ms | 17.56 | .4505 / .0521 | 105,884 |
| altar-activation | 2400 ms | 43.23 | .3574 / .0720 | 211,724 |

Process RSS ranged from 89,583,616 to 105,160,704 bytes across these renders.
This includes Node/tsx and prior allocations; it is not per-effect memory use.
PCM buffers ranged from 141,120 to 846,720 bytes. Full metrics and parameters are
in `examples/audio/validation.json` and the five corresponding `.sound.json`
files; `.wav` files are alongside them. All five were finite, non-silent and
unclipped. Reproduce using `npm run examples:audio` or the CLI commands in the
[audio guide](README.md).

## Mathematical and safety evidence

Tests independently check sine frequency/crossings, discrete sweep phase,
envelope boundaries, analytic linear ODE decay, modal resonator samples,
nonlinear stable radius, logarithmic branch signs, distortion symmetry/asymmetry,
filter response, exact delay placement, PolyBLEP alias-energy reduction, seeded
substreams, supported sample rates, round-to-sample duration and silence/clipping.
Malformed/unsupported documents, invalid timing/frequencies, duplicate IDs,
resource excess, unstable ODE state, feedback limits, unsafe manifest paths,
source-overwrite attempts and managed/unmanaged export protection are rejected.
Atomic edit failure preserves the original file.

Six-parameter logarithmic semantics were checked against local paper B equation
33.8, and ODE methodology against paper A. Physical and normalized coefficients
are documented separately in the [DSP contract](../../.agents/skills/pixelforge-audio-creator/references/sound-model.md).
The PDFs are ignored local research inputs, not distributed files. No runtime
dependency was added beyond the already-used Zod; new package code is MIT.

## Limits and release readiness

Local implementation verification does not authorize publication. Linux/macOS,
Firefox/Safari and the minimum Node22 runtime have not been executed for v0.6.
CI now provisions Python, but an unexecuted workflow is not platform evidence.
Public namespace ownership, publisher credentials, license/provenance review of
the complete release and user approval remain separate publication gates.

Known product limits: mono PCM16; direct triangle aliases at high pitches;
4x nonlinear reconstruction/filtering reduces rather than eliminates aliasing;
effect tails truncate at document duration. No calibrated circuit fidelity,
advanced coupled ODE graph, arbitrary code, automatic normalization, spectrogram,
MP3/Ogg or Style DNA is claimed. Human listening remains necessary for subjective
quality and game-context suitability.
