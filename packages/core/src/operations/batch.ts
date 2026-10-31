import * as game from "./game.js";
import {
  gameMetadataSchema,
  gameBoxSchema,
  gameEventSchema,
  collisionBodySchema,
} from "../schema/game.js";
import * as model from "../models/project.js";
import * as structure from "./structure.js";
import { colorSchema } from "../schema/project.js";
import { z } from "zod";
import {
  cloneProject,
  copyFrame,
  createFrame,
  createLayer,
  toDocument,
  type Project,
} from "../models/project.js";
import {
  setPixel,
  clearPixel,
  drawLine,
  drawRect,
  drawEllipse,
  floodFill,
  moveRegion,
  flipHorizontal,
  flipVertical,
  replaceColor,
  clearFrame,
} from "./pixels.js";
const n = z.number().int().min(-1_000_000).max(1_000_000),
  id = z.string().min(1).max(128),
  c = z.number().int().min(0).max(255);
const target = { frame: id, layer: id },
  point = { x: n, y: n },
  shape = {
    ...target,
    ...point,
    width: n,
    height: n,
    color: c,
    filled: z.boolean().optional(),
  };
export const operationSchema = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("setSpriteOrigin"),
    origin: gameMetadataSchema.shape.origin,
  }),
  z.strictObject({
    op: z.literal("setCollisionBody"),
    body: collisionBodySchema,
  }),
  z.strictObject({ op: z.literal("clearCollisionBody") }),
  z.strictObject({ op: z.literal("addGameBox"), box: gameBoxSchema }),
  z.strictObject({ op: z.literal("updateGameBox"), id, box: gameBoxSchema }),
  z.strictObject({ op: z.literal("removeGameBox"), id }),
  z.strictObject({
    op: z.literal("setAnimationEvent"),
    event: gameEventSchema,
  }),
  z.strictObject({ op: z.literal("removeAnimationEvent"), id }),
  z.strictObject({
    op: z.literal("setAnchor"),
    anchor: gameMetadataSchema.shape.anchors.element,
  }),
  z.strictObject({ op: z.literal("removeAnchor"), id }),
  z.strictObject({
    op: z.literal("addAnimation"),
    name: id,
    frames: z
      .array(
        z.strictObject({
          frameId: id,
          durationMs: z.number().int().min(1).max(3600000),
        }),
      )
      .min(1),
    loop: z.boolean().optional(),
  }),
  z.strictObject({ op: z.literal("renameAnimation"), name: id, newName: id }),
  z.strictObject({ op: z.literal("removeAnimation"), name: id }),
  z.strictObject({
    op: z.literal("addAnimationFrame"),
    name: id,
    frameId: id,
    durationMs: z.number().int().min(1).max(3600000),
    index: z.number().int().nonnegative().optional(),
  }),
  z.strictObject({
    op: z.literal("removeAnimationFrame"),
    name: id,
    index: z.number().int().nonnegative(),
  }),
  z.strictObject({
    op: z.literal("reorderAnimationFrames"),
    name: id,
    indices: z.array(z.number().int().nonnegative()),
  }),
  z.strictObject({
    op: z.literal("setFrameDuration"),
    name: id,
    index: z.number().int().nonnegative(),
    durationMs: z.number().int().min(1).max(3600000),
  }),
  z.strictObject({
    op: z.literal("setAnimationLoop"),
    name: id,
    loop: z.boolean(),
  }),
  z.strictObject({ op: z.literal("removeFrame"), id }),
  z.strictObject({ op: z.literal("reorderFrames"), ids: z.array(id) }),
  z.strictObject({ op: z.literal("renameLayer"), id, name: id }),
  z.strictObject({ op: z.literal("removeLayer"), id }),
  z.strictObject({ op: z.literal("reorderLayers"), ids: z.array(id) }),
  z.strictObject({
    op: z.literal("setLayerVisibility"),
    id,
    visible: z.boolean(),
  }),
  z.strictObject({ op: z.literal("addPaletteColor"), color: colorSchema }),
  z.strictObject({
    op: z.literal("updatePaletteColor"),
    index: c,
    color: colorSchema,
  }),
  z.strictObject({ op: z.literal("removePaletteColor"), index: c }),
  z.strictObject({ op: z.literal("setPixel"), ...target, ...point, color: c }),
  z.strictObject({ op: z.literal("clearPixel"), ...target, ...point }),
  z.strictObject({
    op: z.literal("drawLine"),
    ...target,
    x0: n,
    y0: n,
    x1: n,
    y1: n,
    color: c,
  }),
  z.strictObject({ op: z.literal("drawRect"), ...shape }),
  z.strictObject({ op: z.literal("drawEllipse"), ...shape }),
  z.strictObject({ op: z.literal("floodFill"), ...target, ...point, color: c }),
  z.strictObject({ op: z.literal("copyFrame"), source: id, id }),
  z.strictObject({ op: z.literal("createFrame"), id }),
  z.strictObject({ op: z.literal("createLayer"), id, name: id.optional() }),
  z.strictObject({
    op: z.literal("moveRegion"),
    ...target,
    ...point,
    width: n,
    height: n,
    dx: n,
    dy: n,
  }),
  z.strictObject({ op: z.literal("flipHorizontal"), ...target }),
  z.strictObject({ op: z.literal("flipVertical"), ...target }),
  z.strictObject({ op: z.literal("replaceColor"), ...target, from: c, to: c }),
  z.strictObject({ op: z.literal("clearFrame"), frame: id }),
]);
export const operationsSchema = z.strictObject({
  version: z.literal("1.0"),
  operations: z.array(operationSchema).max(100_000),
});
export const operationsJsonSchema = z.toJSONSchema(operationsSchema, {
  target: "draft-2020-12",
});
export function applyOperations(project: Project, input: unknown): Project {
  const batch = operationsSchema.parse(input),
    p = cloneProject(project);
  batch.operations.forEach((o, index) => {
    try {
      switch (o.op) {
        case "setSpriteOrigin":
          game.setSpriteOrigin(p, o.origin);
          break;
        case "setCollisionBody":
          game.setCollisionBody(p, o.body);
          break;
        case "clearCollisionBody":
          game.clearCollisionBody(p);
          break;
        case "addGameBox":
          game.addGameBox(p, o.box);
          break;
        case "updateGameBox":
          game.updateGameBox(p, o.id, o.box);
          break;
        case "removeGameBox":
          game.removeGameBox(p, o.id);
          break;
        case "setAnimationEvent":
          game.setAnimationEvent(p, o.event);
          break;
        case "removeAnimationEvent":
          game.removeAnimationEvent(p, o.id);
          break;
        case "setAnchor":
          game.setAnchor(p, o.anchor);
          break;
        case "removeAnchor":
          game.removeAnchor(p, o.id);
          break;
        case "addAnimation":
          model.addAnimation(p, o.name, o.frames, o.loop);
          break;
        case "renameAnimation":
          model.renameAnimation(p, o.name, o.newName);
          break;
        case "removeAnimation":
          structure.removeAnimation(p, o.name);
          break;
        case "addAnimationFrame":
          model.addAnimationFrame(p, o.name, o.frameId, o.durationMs, o.index);
          break;
        case "removeAnimationFrame":
          model.removeAnimationFrame(p, o.name, o.index);
          break;
        case "reorderAnimationFrames":
          model.reorderAnimationFrames(p, o.name, o.indices);
          break;
        case "setFrameDuration":
          model.setFrameDuration(p, o.name, o.index, o.durationMs);
          break;
        case "setAnimationLoop":
          structure.setAnimationLoop(p, o.name, o.loop);
          break;
        case "removeFrame":
          model.removeFrame(p, o.id);
          break;
        case "reorderFrames":
          model.reorderFrames(p, o.ids);
          break;
        case "renameLayer":
          structure.renameLayer(p, o.id, o.name);
          break;
        case "removeLayer":
          structure.removeLayer(p, o.id);
          break;
        case "reorderLayers":
          structure.reorderLayers(p, o.ids);
          break;
        case "setLayerVisibility":
          structure.setLayerVisibility(p, o.id, o.visible);
          break;
        case "addPaletteColor":
          structure.addPaletteColor(p, o.color);
          break;
        case "updatePaletteColor":
          structure.updatePaletteColor(p, o.index, o.color);
          break;
        case "removePaletteColor":
          structure.removePaletteColor(p, o.index);
          break;
        case "setPixel":
          setPixel(p, o.frame, o.layer, o.x, o.y, o.color);
          break;
        case "clearPixel":
          clearPixel(p, o.frame, o.layer, o.x, o.y);
          break;
        case "drawLine":
          drawLine(p, o.frame, o.layer, o.x0, o.y0, o.x1, o.y1, o.color);
          break;
        case "drawRect":
          drawRect(
            p,
            o.frame,
            o.layer,
            o.x,
            o.y,
            o.width,
            o.height,
            o.color,
            o.filled,
          );
          break;
        case "drawEllipse":
          drawEllipse(
            p,
            o.frame,
            o.layer,
            o.x,
            o.y,
            o.width,
            o.height,
            o.color,
            o.filled,
          );
          break;
        case "floodFill":
          floodFill(p, o.frame, o.layer, o.x, o.y, o.color);
          break;
        case "copyFrame":
          copyFrame(p, o.source, o.id);
          break;
        case "createFrame":
          createFrame(p, o.id);
          break;
        case "createLayer":
          createLayer(p, o.id, o.name);
          break;
        case "moveRegion":
          moveRegion(
            p,
            o.frame,
            o.layer,
            o.x,
            o.y,
            o.width,
            o.height,
            o.dx,
            o.dy,
          );
          break;
        case "flipHorizontal":
          flipHorizontal(p, o.frame, o.layer);
          break;
        case "flipVertical":
          flipVertical(p, o.frame, o.layer);
          break;
        case "replaceColor":
          replaceColor(p, o.frame, o.layer, o.from, o.to);
          break;
        case "clearFrame":
          clearFrame(p, o.frame);
          break;
      }
    } catch (error) {
      throw new Error(
        `Operation ${index} (${o.op}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
  toDocument(p);
  return p;
}
