import { getFrame, type Project } from "../models/project.js";
import { getGameMetadata } from "../models/game.js";
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function planeBounds(p: Project, data: Uint8Array): Bounds | null {
  let minX = p.width,
    minY = p.height,
    maxX = -1,
    maxY = -1;
  for (let i = 0; i < data.length; i++)
    if (p.palette[data[i]!]![3] > 0) {
      const x = i % p.width,
        y = Math.floor(i / p.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  return maxX < 0
    ? null
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
export function frameBounds(p: Project, id: string) {
  const frame = getFrame(p, id),
    data = new Uint8Array(p.width * p.height);
  for (const layer of p.layers)
    if (layer.visible) {
      const plane = frame.layers.get(layer.id)!;
      for (let i = 0; i < plane.length; i++)
        if (p.palette[plane[i]!]![3] > 0) data[i] = plane[i]!;
    }
  return planeBounds(p, data);
}
export function sharedFrameUses(p: Project, id: string) {
  return p.animations.flatMap((a) =>
    a.frames.flatMap((f, index) =>
      f.frameId === id ? [{ animation: a.name, index }] : [],
    ),
  );
}
export function inspectProject(
  p: Project,
  options: {
    animation?: string;
    frame?: string;
    layer?: string;
    game?: boolean;
    palette?: boolean;
    frames?: boolean;
    limit?: number;
    offset?: number;
    sourceBytes?: number;
  } = {},
) {
  const limit = options.limit ?? 25,
    offset = options.offset ?? 0;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0
  )
    throw new Error("Inspection limit must be1..100 and offset nonnegative");
  const page = <T>(items: T[]) => ({
    total: items.length,
    offset,
    limit,
    truncated: offset + limit < items.length,
    items: items.slice(offset, offset + limit),
  });
  const summary = {
    name: p.name,
    version: p.version,
    width: p.width,
    height: p.height,
    frameCount: p.frames.length,
    layerCount: p.layers.length,
    layers: page(p.layers),
    paletteSize: p.palette.length,
    sourceBytes: options.sourceBytes ?? null,
    gameMetadataPresent: p.metadata?.pixelforgeGame !== undefined,
    animations: page(
      p.animations.map((a) => ({
        name: a.name,
        entryCount: a.frames.length,
        totalDurationMs: a.frames.reduce((n, f) => n + f.durationMs, 0),
        loop: a.loop,
      })),
    ),
  };
  if (options.palette)
    return {
      ...summary,
      palette: page(p.palette.map((rgba, index) => ({ index, rgba }))),
    };
  if (options.frames)
    return { ...summary, frames: page(p.frames.map((f) => ({ id: f.id }))) };
  if (options.animation) {
    const a = p.animations.find((a) => a.name === options.animation);
    if (!a) throw new Error(`Unknown animation ${options.animation}`);
    return {
      ...summary,
      selectedAnimation: {
        name: a.name,
        loop: a.loop,
        entries: page(a.frames),
      },
    };
  }
  if (options.frame) {
    const f = getFrame(p, options.frame);
    return {
      ...summary,
      selectedFrame: {
        id: f.id,
        bounds: frameBounds(p, f.id),
        layers: page(
          p.layers.map((l) => ({
            id: l.id,
            visible: l.visible,
            bounds: planeBounds(p, f.layers.get(l.id)!),
          })),
        ),
        usedBy: page(sharedFrameUses(p, f.id)),
      },
    };
  }
  if (options.layer) {
    const l = p.layers.find((l) => l.id === options.layer);
    if (!l) throw new Error(`Unknown layer ${options.layer}`);
    return {
      ...summary,
      selectedLayer: {
        ...l,
        frames: {
          total: p.frames.length,
          offset,
          limit,
          truncated: offset + limit < p.frames.length,
          items: p.frames
            .slice(offset, offset + limit)
            .map((f) => ({
              id: f.id,
              bounds: planeBounds(p, f.layers.get(l.id)!),
            })),
        },
      },
    };
  }
  if (options.game) {
    const game = getGameMetadata(p);
    return {
      ...summary,
      game: {
        version: game.version,
        origin: game.origin,
        body: game.body ?? null,
        anchors: page(game.anchors),
        boxes: page(game.boxes),
        events: page(
          game.events.map(({ data, ...event }) => ({
            ...event,
            dataKeys: Object.keys(data ?? {})
              .slice(0, 25)
              .map((key) => key.slice(0, 128)),
          })),
        ),
      },
    };
  }
  return summary;
}
