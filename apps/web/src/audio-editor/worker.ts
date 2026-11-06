import { renderSound } from "@pixelforge/audio-core";
self.onmessage = (event: MessageEvent<{ id: number; project: unknown }>) => {
  try {
    const result = renderSound(event.data.project);
    self.postMessage({
      id: event.data.id,
      pcm: result.pcm,
      metrics: result.metrics,
    });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
