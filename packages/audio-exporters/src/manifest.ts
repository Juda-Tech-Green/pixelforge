import {
  audioManifestSchema,
  renderSound,
  serializeSound,
  type AudioManifest,
} from "@pixelforge/audio-core";
import { encodeWav } from "./index.js";

export function assembleAudioBundle(
  input: unknown,
  events: AudioManifest["events"] = [],
) {
  const { project, pcm, metrics } = renderSound(input);
  const key = project.export?.key ?? project.id;
  const manifest = audioManifestSchema.parse({
    version: "1.0",
    kind: "pixelforge-audio",
    assets: [
      {
        key,
        file: `${key}.wav`,
        source: `${key}.sound.json`,
        sampleRate: project.sampleRate,
        durationMs: project.durationMs,
      },
    ],
    events,
  });
  const files: Record<string, string | Uint8Array> = {
    [`${key}.wav`]: encodeWav(pcm, project.sampleRate),
    [`${key}.sound.json`]: serializeSound(project),
    "audio.json": JSON.stringify(manifest, null, 2) + "\n",
  };
  return { manifest, files, metrics };
}
