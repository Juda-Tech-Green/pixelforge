import { type Project } from "../models/project.js";
import { getGameMetadata } from "../models/game.js";
import { frameBounds, sharedFrameUses } from "./inspect.js";
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function diffProjects(
  before: Project,
  after: Project,
  options: {
    limit?: number;
    preserveFrames?: string[];
    preserveLayers?: string[];
    preserveGame?: boolean;
  } = {},
) {
  const limit = options.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Diff limit must be1..100");
  const page = <T>(items: T[]) => ({
    total: items.length,
    truncated: items.length > limit,
    items: items.slice(0, limit),
  });
  const identifiers = (a: string[], b: string[]) => ({
    added: page(b.filter((id) => !a.includes(id))),
    removed: page(a.filter((id) => !b.includes(id))),
  });
  const changedFrames: {
    id: string;
    changedPixels: number;
    layers: { id: string; changedPixels: number }[];
    beforeBounds: ReturnType<typeof frameBounds>;
    afterBounds: ReturnType<typeof frameBounds>;
  }[] = [];
  const layerIds = [
    ...new Set([...before.layers, ...after.layers].map((l) => l.id)),
  ];
  for (const id of new Set(
    [...before.frames, ...after.frames].map((f) => f.id),
  )) {
    const a = before.frames.find((f) => f.id === id),
      b = after.frames.find((f) => f.id === id),
      layers = [];
    for (const layer of layerIds) {
      const x = a?.layers.get(layer),
        y = b?.layers.get(layer);
      let count = 0;
      for (let i = 0; i < Math.max(x?.length ?? 0, y?.length ?? 0); i++)
        if (x?.[i] !== y?.[i]) count++;
      if (count) layers.push({ id: layer, changedPixels: count });
    }
    if (
      layers.length ||
      !a ||
      !b ||
      before.width !== after.width ||
      before.height !== after.height
    )
      changedFrames.push({
        id,
        changedPixels: layers.reduce((s, l) => s + l.changedPixels, 0),
        layers,
        beforeBounds: a ? frameBounds(before, id) : null,
        afterBounds: b ? frameBounds(after, id) : null,
      });
  }
  const animationNames = [
    ...new Set([...before.animations, ...after.animations].map((a) => a.name)),
  ];
  const animations = animationNames.flatMap((name) => {
    const a = before.animations.find((a) => a.name === name),
      b = after.animations.find((a) => a.name === name);
    return equal(a, b)
      ? []
      : [
          {
            name,
            sequenceChanged: !equal(
              a?.frames.map((f) => f.frameId),
              b?.frames.map((f) => f.frameId),
            ),
            timingChanged: !equal(
              a?.frames.map((f) => f.durationMs),
              b?.frames.map((f) => f.durationMs),
            ),
            loopChanged: a?.loop !== b?.loop,
            beforeEntries: a?.frames.length ?? 0,
            afterEntries: b?.frames.length ?? 0,
          },
        ];
  });
  const palette = Array.from(
    { length: Math.max(before.palette.length, after.palette.length) },
    (_, index) => index,
  ).filter((i) => !equal(before.palette[i], after.palette[i]));
  const gameBefore = getGameMetadata(before),
    gameAfter = getGameMetadata(after);
  const anchorIds = [
    ...new Set([...gameBefore.anchors, ...gameAfter.anchors].map((a) => a.id)),
  ];
  const anchors = anchorIds.filter(
    (id) =>
      !equal(
        gameBefore.anchors.find((a) => a.id === id),
        gameAfter.anchors.find((a) => a.id === id),
      ),
  );
  const gameChanged = !equal(gameBefore, gameAfter),
    violations: string[] = [];
  for (const id of options.preserveFrames ?? [])
    if (
      !before.frames.some((f) => f.id === id) ||
      changedFrames.some((f) => f.id === id)
    )
      violations.push(`Preserved frame changed or absent: ${id}`);
  for (const id of options.preserveLayers ?? [])
    if (
      !before.layers.some((l) => l.id === id) ||
      !equal(
        before.layers.find((l) => l.id === id),
        after.layers.find((l) => l.id === id),
      ) ||
      changedFrames.some((f) => f.layers.some((l) => l.id === id))
    )
      violations.push(`Preserved layer changed or absent: ${id}`);
  if (options.preserveGame && gameChanged)
    violations.push("Preserved game metadata changed");
  const warnings = changedFrames.flatMap((f) => {
    const uses = sharedFrameUses(before, f.id);
    return uses.length > 1
      ? [
          {
            frame: f.id,
            referenceCount: uses.length,
            animations: [...new Set(uses.map((u) => u.animation))].slice(
              0,
              limit,
            ),
            message:
              "Editing this source affects multiple entries; duplicate and retarget before sequence-specific edits",
          },
        ]
      : [];
  });
  return {
    ok: !violations.length,
    dimensionsChanged:
      before.width !== after.width || before.height !== after.height,
    changedSourceFrames: {
      ...page(changedFrames),
      items: changedFrames
        .slice(0, limit)
        .map((f) => ({ ...f, layers: page(f.layers) })),
    },
    changedPixelCount: changedFrames.reduce((s, f) => s + f.changedPixels, 0),
    changedLayers: page(
      layerIds.filter(
        (id) =>
          !equal(
            before.layers.find((l) => l.id === id),
            after.layers.find((l) => l.id === id),
          ) || changedFrames.some((f) => f.layers.some((l) => l.id === id)),
      ),
    ),
    paletteChanges: page(palette),
    animationChanges: page(animations),
    gameChanged,
    collisionChanged:
      !equal(gameBefore.body, gameAfter.body) ||
      !equal(gameBefore.boxes, gameAfter.boxes),
    originChanged: !equal(gameBefore.origin, gameAfter.origin),
    anchorChanges: page(anchors),
    metadataChanged: !equal(before.metadata, after.metadata),
    identifiers: {
      frames: identifiers(
        before.frames.map((f) => f.id),
        after.frames.map((f) => f.id),
      ),
      layers: identifiers(
        before.layers.map((l) => l.id),
        after.layers.map((l) => l.id),
      ),
      animations: identifiers(
        before.animations.map((a) => a.name),
        after.animations.map((a) => a.name),
      ),
    },
    warnings: page(warnings),
    preservationViolations: violations,
  };
}
