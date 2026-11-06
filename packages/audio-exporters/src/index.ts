export { assembleAudioBundle } from "./manifest.js";
/** RIFF PCM16, round ties toward +Infinity; negative full scale is -32768. */
export function encodeWav(pcm: Float64Array, sampleRate: number): Uint8Array {
  if (![22050, 44100, 48000].includes(sampleRate))
    throw new Error("Unsupported sample rate");
  if (pcm.length < 1 || pcm.length > 480000)
    throw new Error("Invalid PCM sample count");
  const bytes = new Uint8Array(44 + pcm.length * 2),
    view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      bytes[offset + i] = value.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const x = pcm[i]!;
    if (!Number.isFinite(x) || Math.abs(x) > 1)
      throw new Error(`Invalid PCM amplitude at ${i}`);
    view.setInt16(44 + i * 2, Math.round(x * (x < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}
