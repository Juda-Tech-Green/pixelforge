import {
  drawLine,
  drawRect,
  drawEllipse,
  floodFill,
  getPixel,
  getFrame,
  getLayer,
  type Project,
} from "@pixelforge/core";
export type Tool =
  | "pencil"
  | "eraser"
  | "fill"
  | "line"
  | "rectangle"
  | "ellipse"
  | "picker"
  | "pan";
export interface Point {
  x: number;
  y: number;
}
export function mapPointer(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
): Point {
  return {
    x: Math.floor(((clientX - bounds.left) * width) / bounds.width),
    y: Math.floor(((clientY - bounds.top) * height) / bounds.height),
  };
}
export function onCanvas(p: Project, q: Point): boolean {
  return q.x >= 0 && q.y >= 0 && q.x < p.width && q.y < p.height;
}
/** Draft owns only the active plane; other frames are neither copied nor mutated. */
export class DrawingGesture {
  readonly draft: Project;
  private last: Point;
  private original: Uint8Array;
  constructor(
    private source: Project,
    private frame: string,
    private layer: string,
    private tool: Tool,
    private color: number,
    private start: Point,
    private filled: boolean,
  ) {
    if (!getLayer(source, layer).visible)
      throw new Error("Show this layer before drawing on it");
    if (!onCanvas(source, start))
      throw new Error("Start drawing inside the canvas");
    this.original = getFrame(source, frame).layers.get(layer)!.slice();
    this.draft = {
      ...source,
      frames: source.frames.map((f) =>
        f.id === frame
          ? {
              ...f,
              layers: new Map(
                [...f.layers].map(([id, pixels]) => [
                  id,
                  id === layer ? pixels.slice() : pixels,
                ]),
              ),
            }
          : f,
      ),
    };
    this.last = start;
    this.move(start);
  }
  move(point: Point): void {
    const p = this.draft,
      f = this.frame,
      l = this.layer,
      c = this.color;
    if (this.tool === "pencil" || this.tool === "eraser")
      drawLine(
        p,
        f,
        l,
        this.last.x,
        this.last.y,
        point.x,
        point.y,
        this.tool === "eraser" ? 0 : c,
      );
    else if (this.tool === "fill") {
      if (point === this.start) floodFill(p, f, l, point.x, point.y, c);
    } else if (["line", "rectangle", "ellipse"].includes(this.tool)) {
      getFrame(p, f).layers.get(l)!.set(this.original);
      // Bounding boxes are limited to the canvas for the core's shape-size contract.
      const q = {
        x: Math.max(0, Math.min(p.width - 1, point.x)),
        y: Math.max(0, Math.min(p.height - 1, point.y)),
      };
      const x = Math.min(this.start.x, q.x),
        y = Math.min(this.start.y, q.y),
        w = Math.abs(q.x - this.start.x) + 1,
        h = Math.abs(q.y - this.start.y) + 1;
      if (this.tool === "line")
        drawLine(p, f, l, this.start.x, this.start.y, q.x, q.y, c);
      if (this.tool === "rectangle")
        drawRect(p, f, l, x, y, w, h, c, this.filled);
      if (this.tool === "ellipse")
        drawEllipse(p, f, l, x, y, w, h, c, this.filled);
    }
    this.last = point;
  }
  finish(): Project {
    return this.draft;
  }
  cancel(): Project {
    return this.source;
  }
}
export function sampleLayer(
  p: Project,
  frame: string,
  layer: string,
  point: Point,
): number {
  return getPixel(p, frame, layer, point.x, point.y);
}
