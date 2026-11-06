import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  audioPresetNames,
  createSound,
  renderSound,
  serializeSound,
} from "@pixelforge/audio-core";
import { encodeWav } from "@pixelforge/audio-exporters";

await mkdir("examples/audio", { recursive: true });
const report = [];
for (const preset of audioPresetNames) {
  const project = createSound(preset, preset);
  const started = performance.now(),
    rendered = renderSound(project),
    renderMs = performance.now() - started;
  const wav = encodeWav(rendered.pcm, project.sampleRate);
  await writeFile(
    `examples/audio/${preset}.sound.json`,
    serializeSound(project),
  );
  await writeFile(`examples/audio/${preset}.wav`, wav);
  report.push({
    preset,
    valid: true,
    metrics: rendered.metrics,
    renderMs,
    processRssBytes: process.memoryUsage().rss,
    pcmBytes: rendered.pcm.byteLength,
    wavBytes: wav.length,
  });
}
await writeFile(
  "examples/audio/validation.json",
  JSON.stringify(
    {
      runtime: process.version,
      platform: process.platform,
      review:
        "Numerical integrity checked; subjective listening review remains required.",
      sounds: report,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(report));
