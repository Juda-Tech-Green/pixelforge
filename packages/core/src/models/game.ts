import { type Project } from "./project.js";
import {
  gameMetadataSchema,
  gameMetadataErrors,
  type GameMetadata,
  type GameScope,
  type GameBox,
} from "../schema/game.js";
export function getGameMetadata(p: Project): GameMetadata {
  return p.metadata?.pixelforgeGame === undefined
    ? {
        version: "1.0",
        origin: { x: 0.5, y: 0.5 },
        boxes: [],
        anchors: [],
        events: [],
      }
    : gameMetadataSchema.parse(p.metadata.pixelforgeGame);
}
export function setGameMetadata(p: Project, input: unknown): void {
  const game = gameMetadataSchema.parse(input),
    errors = gameMetadataErrors(game, p);
  if (errors.length) throw new Error(errors.join("; "));
  p.metadata = {
    ...p.metadata,
    pixelforgeGame: JSON.parse(JSON.stringify(game)) as NonNullable<
      Project["metadata"]
    >[string],
  };
}
function matches(
  s: GameScope,
  frame: string,
  animation?: string,
  index?: number,
): boolean {
  return (
    s.type === "project" ||
    (s.type === "frame" && s.frameId === frame) ||
    (s.type === "animation" && s.animation === animation) ||
    (s.type === "entry" && s.animation === animation && s.index === index)
  );
}
/** Named regions override by specificity: project < animation < source frame < entry. Disabled overrides suppress inherited regions. */
export function resolveGameBoxes(
  game: GameMetadata,
  frame: string,
  animation?: string,
  index?: number,
): GameBox[] {
  const map = new Map<string, GameBox>();
  for (const type of ["project", "animation", "frame", "entry"])
    for (const b of game.boxes)
      if (b.scope.type === type && matches(b.scope, frame, animation, index))
        map.set(`${b.kind}:${b.name}`, b);
  return [...map.values()].filter((b) => b.enabled);
}
export interface SpriteTransform {
  x: number;
  y: number;
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
  flipX: boolean;
  flipY?: boolean;
  rotation?: number;
}
export function boxToWorld(
  rect: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
  t: SpriteTransform,
) {
  if (t.rotation)
    throw new Error("Rotated world-space boxes are not supported");
  if (
    ![t.x, t.y, t.originX, t.originY, t.scaleX, t.scaleY].every(Number.isFinite)
  )
    throw new Error("Transform values must be finite");
  const x = t.flipX ? width - rect.x - rect.width : rect.x,
    y = t.flipY ? height - rect.y - rect.height : rect.y;
  const x1 = t.x + (x - width * t.originX) * t.scaleX,
    y1 = t.y + (y - height * t.originY) * t.scaleY,
    x2 = x1 + rect.width * t.scaleX,
    y2 = y1 + rect.height * t.scaleY;
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}
