import { getFrame, type Project } from "../models/project.js";
function integer(...values: number[]): void {
  if (values.some((v) => !Number.isSafeInteger(v) || Math.abs(v) > 1_000_000))
    throw new RangeError("Coordinates must be integers within ±1000000");
}
function color(p: Project, c: number): void {
  if (!Number.isInteger(c) || c < 0 || c >= p.palette.length)
    throw new RangeError(`Invalid palette index: ${c}`);
}
function pixels(p: Project, frame: string, layer: string): Uint8Array {
  const data = getFrame(p, frame).layers.get(layer);
  if (!data) throw new Error(`Unknown layer: ${layer}`);
  return data;
}
function inside(p: Project, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < p.width && y < p.height;
}
export function setPixel(
  p: Project,
  f: string,
  l: string,
  x: number,
  y: number,
  c: number,
): void {
  integer(x, y);
  color(p, c);
  const d = pixels(p, f, l);
  if (!inside(p, x, y)) throw new RangeError("Pixel outside canvas");
  d[y * p.width + x] = c;
}
export function getPixel(
  p: Project,
  f: string,
  l: string,
  x: number,
  y: number,
): number {
  integer(x, y);
  const d = pixels(p, f, l);
  if (!inside(p, x, y)) throw new RangeError("Pixel outside canvas");
  return d[y * p.width + x]!;
}
export function clearPixel(
  p: Project,
  f: string,
  l: string,
  x: number,
  y: number,
): void {
  setPixel(p, f, l, x, y, 0);
}
function painter(
  p: Project,
  f: string,
  l: string,
  c: number,
): (x: number, y: number) => void {
  color(p, c);
  const d = pixels(p, f, l);
  return (x, y) => {
    if (inside(p, x, y)) d[y * p.width + x] = c;
  };
}
export function drawLine(
  p: Project,
  f: string,
  l: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: number,
): void {
  integer(x0, y0, x1, y1);
  const put = painter(p, f, l, c);
  const dx = Math.abs(x1 - x0),
    sx = x0 < x1 ? 1 : -1,
    dy = -Math.abs(y1 - y0),
    sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    put(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e = 2 * err;
    if (e >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
function extent(x: number, y: number, w: number, h: number): void {
  integer(x, y, w, h);
  if (w < 1 || h < 1 || w > 1024 || h > 1024)
    throw new RangeError("Shape dimensions must be 1–1024");
}
export function drawRect(
  p: Project,
  f: string,
  l: string,
  x: number,
  y: number,
  w: number,
  h: number,
  c: number,
  filled = true,
): void {
  extent(x, y, w, h);
  const put = painter(p, f, l, c);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++)
      if (filled || i === 0 || j === 0 || i === w - 1 || j === h - 1)
        put(x + i, y + j);
}
// Integer cell-center ellipse predicate. Outline is its four-neighbor interior boundary.
export function drawEllipse(
  p: Project,
  f: string,
  l: string,
  x: number,
  y: number,
  w: number,
  h: number,
  c: number,
  filled = true,
): void {
  extent(x, y, w, h);
  const put = painter(p, f, l, c);
  const contains = (i: number, j: number) =>
    i >= 0 &&
    j >= 0 &&
    i < w &&
    j < h &&
    (2 * i + 1 - w) ** 2 * h * h + (2 * j + 1 - h) ** 2 * w * w <=
      w * w * h * h;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++)
      if (
        contains(i, j) &&
        (filled ||
          !contains(i - 1, j) ||
          !contains(i + 1, j) ||
          !contains(i, j - 1) ||
          !contains(i, j + 1))
      )
        put(x + i, y + j);
}
export function floodFill(
  p: Project,
  f: string,
  l: string,
  x: number,
  y: number,
  c: number,
): void {
  const original = getPixel(p, f, l, x, y);
  color(p, c);
  if (original === c) return;
  const d = pixels(p, f, l);
  const queue = [y * p.width + x];
  d[queue[0]!] = c;
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]!,
      px = at % p.width,
      py = Math.floor(at / p.width);
    for (const [nx, ny] of [
      [px - 1, py],
      [px + 1, py],
      [px, py - 1],
      [px, py + 1],
    ] as [number, number][]) {
      const n = ny * p.width + nx;
      if (inside(p, nx, ny) && d[n] === original) {
        d[n] = c;
        queue.push(n);
      }
    }
  }
}
export function moveRegion(
  p: Project,
  f: string,
  l: string,
  x: number,
  y: number,
  w: number,
  h: number,
  dx: number,
  dy: number,
): void {
  extent(x, y, w, h);
  integer(dx, dy);
  const d = pixels(p, f, l),
    snapshot = d.slice();
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++)
      if (inside(p, x + i, y + j)) d[(y + j) * p.width + x + i] = 0;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++)
      if (inside(p, x + i, y + j) && inside(p, x + i + dx, y + j + dy))
        d[(y + j + dy) * p.width + x + i + dx] =
          snapshot[(y + j) * p.width + x + i]!;
}
export function flipHorizontal(p: Project, f: string, l: string): void {
  const d = pixels(p, f, l),
    s = d.slice();
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++)
      d[y * p.width + x] = s[y * p.width + p.width - 1 - x]!;
}
export function flipVertical(p: Project, f: string, l: string): void {
  const d = pixels(p, f, l),
    s = d.slice();
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++)
      d[y * p.width + x] = s[(p.height - 1 - y) * p.width + x]!;
}
export function replaceColor(
  p: Project,
  f: string,
  l: string,
  from: number,
  to: number,
): void {
  color(p, from);
  color(p, to);
  const d = pixels(p, f, l);
  for (let i = 0; i < d.length; i++) if (d[i] === from) d[i] = to;
}
export function clearFrame(p: Project, f: string): void {
  getFrame(p, f).layers.forEach((d) => d.fill(0));
}
