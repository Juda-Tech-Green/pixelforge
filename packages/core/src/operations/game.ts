import type { Project } from "../models/project.js";
import { getGameMetadata, setGameMetadata } from "../models/game.js";
import {
  gameMetadataSchema,
  gameBoxSchema,
  gameEventSchema,
  type CollisionBody,
  type GameBox,
} from "../schema/game.js";
import type { z } from "zod";
export function setSpriteOrigin(
  p: Project,
  origin: { x: number; y: number },
): void {
  const game = getGameMetadata(p);
  game.origin = gameMetadataSchema.shape.origin.parse(origin);
  setGameMetadata(p, game);
}
export function setCollisionBody(p: Project, body: CollisionBody): void {
  const game = getGameMetadata(p);
  game.body = body;
  setGameMetadata(p, game);
}
export function clearCollisionBody(p: Project): void {
  const game = getGameMetadata(p);
  delete game.body;
  setGameMetadata(p, game);
}
export function addGameBox(p: Project, input: GameBox): void {
  const box = gameBoxSchema.parse(input),
    game = getGameMetadata(p);
  if (game.boxes.some((b) => b.id === box.id))
    throw new Error(`Duplicate box ID: ${box.id}`);
  game.boxes.push(box);
  setGameMetadata(p, game);
}
export function updateGameBox(p: Project, id: string, input: GameBox): void {
  const box = gameBoxSchema.parse(input),
    game = getGameMetadata(p),
    index = game.boxes.findIndex((b) => b.id === id);
  if (index < 0) throw new Error(`Unknown box: ${id}`);
  if (box.id !== id) throw new Error("Box ID is immutable");
  game.boxes[index] = box;
  setGameMetadata(p, game);
}
export function removeGameBox(p: Project, id: string): void {
  const game = getGameMetadata(p);
  if (!game.boxes.some((b) => b.id === id))
    throw new Error(`Unknown box: ${id}`);
  game.boxes = game.boxes.filter((b) => b.id !== id);
  setGameMetadata(p, game);
}
export function setAnimationEvent(
  p: Project,
  input: z.infer<typeof gameEventSchema>,
): void {
  const event = gameEventSchema.parse(input),
    game = getGameMetadata(p),
    index = game.events.findIndex((e) => e.id === event.id);
  if (index < 0) game.events.push(event);
  else game.events[index] = event;
  setGameMetadata(p, game);
}
export function removeAnimationEvent(p: Project, id: string): void {
  const game = getGameMetadata(p);
  if (!game.events.some((e) => e.id === id))
    throw new Error(`Unknown event: ${id}`);
  game.events = game.events.filter((e) => e.id !== id);
  setGameMetadata(p, game);
}
export function setAnchor(
  p: Project,
  input: z.infer<typeof gameMetadataSchema>["anchors"][number],
): void {
  const anchor = gameMetadataSchema.shape.anchors.element.parse(input),
    game = getGameMetadata(p),
    index = game.anchors.findIndex((a) => a.id === anchor.id);
  if (index < 0) game.anchors.push(anchor);
  else game.anchors[index] = anchor;
  setGameMetadata(p, game);
}
export function removeAnchor(p: Project, id: string): void {
  const game = getGameMetadata(p);
  if (!game.anchors.some((a) => a.id === id))
    throw new Error(`Unknown anchor: ${id}`);
  game.anchors = game.anchors.filter((a) => a.id !== id);
  setGameMetadata(p, game);
}
