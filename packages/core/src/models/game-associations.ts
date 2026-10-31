import type { Project } from "./project.js";
import { getGameMetadata } from "./game.js";
/** Called only after operation arguments are checked; keeps entry scopes attached to entries. */
export function remapGameEntries(
  p: Project,
  name: string,
  map: (old: number) => number | undefined,
): void {
  if (p.metadata?.pixelforgeGame === undefined) return;
  const game = getGameMetadata(p);
  for (const record of [...game.boxes, ...game.anchors])
    if (record.scope.type === "entry" && record.scope.animation === name) {
      const next = map(record.scope.index);
      if (next === undefined)
        throw new Error(
          "Remove entry metadata before deleting its animation entry",
        );
      record.scope.index = next;
    }
  for (const event of game.events)
    if (event.animation === name) {
      const next = map(event.index);
      if (next === undefined)
        throw new Error("Remove animation events before deleting their entry");
      event.index = next;
    }
  p.metadata.pixelforgeGame = JSON.parse(JSON.stringify(game)) as NonNullable<
    Project["metadata"]
  >[string];
}
export function renameGameAnimation(
  p: Project,
  oldName: string,
  newName: string,
): void {
  if (p.metadata?.pixelforgeGame === undefined) return;
  const game = getGameMetadata(p);
  for (const r of [...game.boxes, ...game.anchors])
    if (
      (r.scope.type === "entry" || r.scope.type === "animation") &&
      r.scope.animation === oldName
    )
      r.scope.animation = newName;
  for (const e of game.events)
    if (e.animation === oldName) e.animation = newName;
  p.metadata.pixelforgeGame = JSON.parse(JSON.stringify(game)) as NonNullable<
    Project["metadata"]
  >[string];
}
export function assertNoGameReference(
  p: Project,
  kind: "frame" | "animation",
  id: string,
): void {
  const g = getGameMetadata(p);
  const referenced =
    [...g.boxes, ...g.anchors].some((r) =>
      kind === "frame"
        ? r.scope.type === "frame" && r.scope.frameId === id
        : (r.scope.type === "animation" || r.scope.type === "entry") &&
          r.scope.animation === id,
    ) ||
    (kind === "animation" && g.events.some((e) => e.animation === id));
  if (referenced)
    throw new Error(
      `Remove game metadata references before deleting ${kind} ${id}`,
    );
}
