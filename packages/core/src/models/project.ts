import {
  validateProject,
  type Color,
  type ProjectDocument,
} from "../schema/project.js";
import {
  remapGameEntries,
  renameGameAnimation,
  assertNoGameReference,
} from "./game-associations.js";
export interface Layer {
  id: string;
  name: string;
  visible: boolean;
}
export interface Frame {
  id: string;
  layers: Map<string, Uint8Array>;
}
export interface AnimationFrame {
  frameId: string;
  durationMs: number;
}
export interface Animation {
  name: string;
  loop: boolean;
  frames: AnimationFrame[];
}
export interface Project {
  version: "1.0";
  name: string;
  width: number;
  height: number;
  palette: Color[];
  layers: Layer[];
  frames: Frame[];
  animations: Animation[];
  metadata?: ProjectDocument["metadata"];
}
export function fromDocument(input: unknown): Project {
  const d = validateProject(input);
  return {
    ...d,
    frames: d.frames.map((f) => ({
      id: f.id,
      layers: new Map(
        Object.entries(f.layers).map(([k, v]) => [k, Uint8Array.from(v)]),
      ),
    })),
  };
}
export function toDocument(p: Project): ProjectDocument {
  return validateProject({
    version: p.version,
    name: p.name,
    width: p.width,
    height: p.height,
    palette: p.palette,
    layers: p.layers,
    frames: p.frames.map((f) => ({
      id: f.id,
      layers: Object.fromEntries(
        p.layers.map((l) => [l.id, Array.from(f.layers.get(l.id) ?? [])]),
      ),
    })),
    animations: p.animations,
    ...(p.metadata ? { metadata: p.metadata } : {}),
  });
}
export function serializeProject(p: Project): string {
  return JSON.stringify(toDocument(p), null, 2) + "\n";
}
export function cloneProject(p: Project): Project {
  return fromDocument(toDocument(p));
}
export function createProject(options: {
  name: string;
  width: number;
  height: number;
  palette?: Color[];
}): Project {
  return fromDocument({
    version: "1.0",
    ...options,
    palette: options.palette ?? [
      [0, 0, 0, 0],
      [255, 255, 255, 255],
    ],
    layers: [{ id: "base", name: "Base", visible: true }],
    frames: [
      {
        id: "frame-0",
        layers: {
          base: Array.from(
            { length: validArea(options.width, options.height) },
            () => 0,
          ),
        },
      },
    ],
    animations: [],
  });
}
function validArea(w: number, h: number): number {
  if (
    !Number.isInteger(w) ||
    !Number.isInteger(h) ||
    w < 1 ||
    h < 1 ||
    w > 1024 ||
    h > 1024
  )
    throw new RangeError("Canvas dimensions must be integers from 1 to 1024");
  return w * h;
}
export function getFrame(p: Project, id: string): Frame {
  const f = p.frames.find((f) => f.id === id);
  if (!f) throw new Error(`Unknown frame: ${id}`);
  return f;
}
export function getAnimation(p: Project, name: string): Animation {
  const a = p.animations.find((a) => a.name === name);
  if (!a) throw new Error(`Unknown animation: ${name}`);
  return a;
}
function checkId(id: string): void {
  if (!id.length || id.length > 128)
    throw new Error("Identifier must contain 1–128 characters");
}
export function createFrame(p: Project, id: string): Frame {
  checkId(id);
  if (p.frames.some((f) => f.id === id))
    throw new Error(`Duplicate frame: ${id}`);
  const f = {
    id,
    layers: new Map(
      p.layers.map((l) => [l.id, new Uint8Array(p.width * p.height)]),
    ),
  };
  p.frames.push(f);
  return f;
}
export function createLayer(p: Project, id: string, name = id): Layer {
  checkId(id);
  checkId(name);
  if (p.layers.some((l) => l.id === id))
    throw new Error(`Duplicate layer: ${id}`);
  const l = { id, name, visible: true };
  p.layers.push(l);
  p.frames.forEach((f) => f.layers.set(id, new Uint8Array(p.width * p.height)));
  return l;
}
export function copyFrame(p: Project, sourceId: string, newId: string): Frame {
  const source = getFrame(p, sourceId);
  const target = createFrame(p, newId);
  target.layers = new Map([...source.layers].map(([k, v]) => [k, v.slice()]));
  return target;
}
export function removeFrame(p: Project, id: string): void {
  getFrame(p, id);
  if (p.frames.length === 1) throw new Error("Cannot remove the last frame");
  if (p.animations.some((a) => a.frames.some((f) => f.frameId === id)))
    throw new Error("Remove animation references before deleting frame");
  assertNoGameReference(p, "frame", id);
  p.frames = p.frames.filter((f) => f.id !== id);
}
export function reorderFrames(p: Project, ids: string[]): void {
  if (ids.length !== p.frames.length || new Set(ids).size !== ids.length)
    throw new Error("Provide every frame ID exactly once");
  const ordered = ids.map((id) => getFrame(p, id));
  p.frames = ordered;
}
export function addAnimation(
  p: Project,
  name: string,
  frames: AnimationFrame[],
  loop = true,
): Animation {
  checkId(name);
  if (p.animations.some((a) => a.name === name))
    throw new Error("Duplicate animation");
  if (!frames.length) throw new Error("Animation needs a frame");
  frames.forEach((f) => {
    getFrame(p, f.frameId);
    checkDuration(f.durationMs);
  });
  const a = { name, loop, frames: frames.map((f) => ({ ...f })) };
  p.animations.push(a);
  return a;
}
function checkDuration(ms: number): void {
  if (!Number.isInteger(ms) || ms < 1 || ms > 3_600_000)
    throw new Error("Duration must be an integer from 1 to 3600000 ms");
}
function entry(a: Animation, i: number): AnimationFrame {
  if (!Number.isInteger(i) || !a.frames[i])
    throw new Error("Invalid animation frame index");
  return a.frames[i]!;
}
export function addAnimationFrame(
  p: Project,
  name: string,
  frameId: string,
  durationMs: number,
  index?: number,
): void {
  const a = getAnimation(p, name);
  getFrame(p, frameId);
  checkDuration(durationMs);
  const i = index ?? a.frames.length;
  if (!Number.isInteger(i) || i < 0 || i > a.frames.length)
    throw new Error("Invalid insertion index");
  remapGameEntries(p, name, (old) => (old >= i ? old + 1 : old));
  a.frames.splice(i, 0, { frameId, durationMs });
}
export function removeAnimationFrame(
  p: Project,
  name: string,
  index: number,
): void {
  const a = getAnimation(p, name);
  entry(a, index);
  if (a.frames.length === 1) throw new Error("Animation needs a frame");
  remapGameEntries(p, name, (old) =>
    old === index ? undefined : old > index ? old - 1 : old,
  );
  a.frames.splice(index, 1);
}
export function reorderAnimationFrames(
  p: Project,
  name: string,
  indices: number[],
): void {
  const a = getAnimation(p, name);
  if (
    indices.length !== a.frames.length ||
    new Set(indices).size !== indices.length
  )
    throw new Error("Provide a permutation of animation indices");
  const frames = indices.map((i) => entry(a, i));
  remapGameEntries(p, name, (old) => indices.indexOf(old));
  a.frames = frames;
}
export function setFrameDuration(
  p: Project,
  name: string,
  index: number,
  ms: number,
): void {
  const f = entry(getAnimation(p, name), index);
  checkDuration(ms);
  f.durationMs = ms;
}
export function renameAnimation(
  p: Project,
  oldName: string,
  newName: string,
): void {
  const a = getAnimation(p, oldName);
  checkId(newName);
  if (p.animations.some((other) => other !== a && other.name === newName))
    throw new Error("Duplicate animation");
  renameGameAnimation(p, oldName, newName);
  a.name = newName;
}
export function animationFrameAt(
  p: Project,
  name: string,
  elapsedMs: number,
): AnimationFrame {
  return getAnimation(p, name).frames[
    animationFrameIndexAt(p, name, elapsedMs)
  ]!;
}
export function animationFrameIndexAt(
  p: Project,
  name: string,
  elapsedMs: number,
): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0)
    throw new Error("Elapsed time must be finite and nonnegative");
  const a = getAnimation(p, name);
  const total = a.frames.reduce((s, f) => s + f.durationMs, 0);
  let t = a.loop ? elapsedMs % total : Math.min(elapsedMs, total - 1);
  for (const [index, f] of a.frames.entries()) {
    if (t < f.durationMs) return index;
    t -= f.durationMs;
  }
  return a.frames.length - 1;
}
