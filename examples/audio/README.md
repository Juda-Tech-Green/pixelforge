# Procedural audio examples

Regenerate the five original definitions and PCM16 WAVs with `npm run examples:audio`.
Each `.sound.json` is the editable source; no model, recording or network is used.
`validation.json` records peak, RMS, sample count, render time, process RSS and sizes.
RSS describes the whole Node process, not isolated per-sound allocation.

Run `npm run dev`, open `/audio.html`, and select a sound in Sound library to
audition and edit it. Playback begins on a user gesture. Turn playback volume down
before comparing sounds; normalized RMS is a measurement, not perceived loudness.

| Source | Techniques |
| --- | --- |
| laser-shot | Saw oscillator, descending exponential pitch, envelope, lowpass, delay |
| gunshot | Seeded filtered noise, fast transient and low-frequency damped body |
| zombie-growl | Nonlinear complex ODE, pulse oscillator, amplitude modulation, saturation |
| metal-impact | Four inharmonic damped resonator partials |
| altar-activation | Three swept sine layers, amplitude modulation, ADSR and delay |

Reproduce individually:

```sh
npm run cli -- audio validate examples/audio/laser-shot.sound.json --render
npm run cli -- audio render examples/audio/laser-shot.sound.json --output test-output/laser.wav
```

Same document and seed produce the same WAV bytes on the same supported runtime.
Cross-engine transcendental arithmetic may differ. The automated checks establish
finite, non-silent output and valid encoding. They do not establish subjective
sound quality; listen for clicks, harshness, lost tails and useful game context.
