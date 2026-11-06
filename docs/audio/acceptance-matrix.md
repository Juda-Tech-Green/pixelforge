# v0.6 completion audit

This maps the original audio brief to executable evidence and maintained source.
Evidence is local Windows/Node24/Chrome; see verification.md for scope and limits.

| Requirement | Authoritative implementation | Verification |
| --- | --- | --- |
| Audit/design; preserve v0.5, no Style DNA | v0.6-implementation-plan.md; separate audio workspaces; unchanged sprite core source | Baseline 70 tests; current full 102 tests; sprite/browser/game-editor regressions |
| Separate canonical sound1.0; defaults, IDs, bounds, metadata, future versions | audio-core/src/schema.ts; generated sound schema | audio-core.test.ts; audio-numerics.test.ts; unknown versions, duplicate IDs, time/frequency/work bounds reject |
| Oscillators, phase, sweeps, antialiasing | dsp.ts and render.ts | Frequency/crossings, discrete phase, all waveform signs; PolyBLEP off-harmonic energy test |
| Versioned seeded white/filtered noise; independent voices | noiseStream; noise render branch | Same/different seeds, stable streams, insertion of independent silent voice |
| ADSR/custom envelopes, interpolation and endpoints | envelopeAt; output.fadeMs | Interpolation, zero-attack stages, timing rejection, default endpoint samples |
| Linear/nonlinear ODE and multimode impulse resonator | renderVoice; nonlinearStep | Analytic damped sine, modal closed form, RK4 linear equivalence, nonlinear stable radius and unstable-node diagnostics |
| Four nonlinear models; six paper coefficients; pre/nonlinear/post order; gain/mix; cost | effectSchema; ordered renderer; sound-model.md | Branch signs and symmetry/asymmetry tests; both filters, zero-wet identity; 4x default used by growl; work limit validation |
| Stable filters/delay/mixing, resource limits, diagnostics | render.ts; schema.ts | Filter response, exact delayed samples, feedback rejection, clipping/silence, bounded duration/voices/work |
| Mono canonical PCM and deterministic WAV; explicit rounding/clipping | render.ts; audio-exporters/src/index.ts | Repeat PCM and WAV; sample rounding; independent Python decode; all five fixture WAVs checked |
| Cross-runtime consistency and honest precision contract | Shared renderer in worker/CLI | All samples of all five presets compared Node/Chrome; maximum delta1.11e-16; same-runtime byte contract documented |
| All audio CLI commands and atomic structured edits | cli/src/audio.ts; operations.ts | audio-cli.test.ts; actual source and packed creation/inspection/validation/render/export/application/discovery; source preserved on failure |
| Managed safe export and stable relative paths | assembleAudioBundle; cli/src/audio-bundle.ts; manifest.ts | Unsafe relative paths rejected; existing/unmanaged files protected; replacement verified; checksums |
| Portable Audio Creator skill; install/version check; five recipes | .agents/skills/pixelforge-audio-creator | 8 skill tests total; independent installed audio checker runs against actual packed0.6 CLI; references resolve |
| Dedicated editor, waveform axes/playhead, voice/envelope/ODE/effect controls, playback, files, diagnostics | apps/web/src/audio-editor | Browser smoke, five presets, edit/save/open/WAV/play, mobile scale/overflow, dirty/draft regression; independent bounded UI review resolved findings |
| Phaser loading and sprite-event association | loadPixelForgeAudio; playPixelForgeSoundEvent; existing observer callback | Independent3.90.0/4.2.1 typed/WebGL consumers: WAV cache, user gesture, event count and nonzero analyser output |
| Five original JSON/WAV demos and audition page | examples/audio; /audio.html; /audio-game.html | Per-effect metrics/reproduction; all five sampler playback actions; independent decode; no external recordings |
| Packaged consumer and existing build tooling | Six workspace packages, pack/prepare/verify scripts | Independent install checks source-free artifacts/types/runtime; fresh-source clean install/build/pack/skill/checksum run |
| Documentation, performance, math, limitations, release distinction | README.md; docs/audio; skill references; validation.json | Exact commands/counts and representative RSS/time/bytes in verification.md; local PDFs ignored; no commits/push/tags/publication |

The optional spectrogram, advanced coupled ODE graph, MP3/Ogg and Style DNA are
explicitly deferred. Subjective audition and host UI skill activation are not
claimed; listening-review and host-configuration guidance is supplied as required.
Platform coverage beyond the executed environments is a disclosed release limit.
