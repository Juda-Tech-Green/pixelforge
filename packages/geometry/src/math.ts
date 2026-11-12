export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
/** [a,b,c,d,tx,ty] maps (x,y) to (a*x+c*y+tx,b*x+d*y+ty). */
export type Affine = [number, number, number, number, number, number];
export const EPSILON = 1e-9;
export function finite(...values: number[]): void {
  if (values.some(v => !Number.isFinite(v) || Math.abs(v) > 1e9)) throw new RangeError("Geometry values must be finite within ±1e9");
}
export function add(a: Vec2, b: Vec2): Vec2 {finite(...a, ...b); return [a[0] + b[0], a[1] + b[1]];}
export function sub(a: Vec2, b: Vec2): Vec2 {finite(...a, ...b); return [a[0] - b[0], a[1] - b[1]];}
export function multiply(v: Vec2, scale: number): Vec2 {finite(...v, scale); const out: Vec2 = [v[0] * scale, v[1] * scale]; finite(...out); return out;}
export function dot(a: Vec2, b: Vec2): number {finite(...a, ...b); return a[0] * b[0] + a[1] * b[1];}
export function length(v: Vec2): number {finite(...v); return Math.hypot(...v);}
export function distance(a: Vec2, b: Vec2): number {return length(sub(a, b));}
export function normalize(v: Vec2): Vec2 {const size = length(v); if (size < EPSILON) throw new RangeError("Cannot normalize a zero vector"); return multiply(v, 1 / size);}
export function rotate(v: Vec2, radians: number): Vec2 {
  finite(...v, radians); const c = Math.cos(radians), s = Math.sin(radians);
  return [c * v[0] - s * v[1], s * v[0] + c * v[1]];
}
export function wrapAngle(angle: number): number {finite(angle); return ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;}
export function interpolateAngle(a: number, b: number, t: number): number {finite(a, b, t); if (t < 0 || t > 1) throw new RangeError("Interpolation fraction must be in [0,1]"); return wrapAngle(a + wrapAngle(b - a) * t);}
export function rasterRound(value: number): number {finite(value); return Math.floor(value + 0.5);}
export function transform(point: Vec2, matrix: Affine): Vec2 {
  finite(...point, ...matrix);
  const [a,b,c,d,x,y] = matrix, [px,py] = point;
  const result: Vec2 = [a * px + c * py + x, b * px + d * py + y]; finite(...result); return result;
}
/** Composition A∘B: apply B first, then A. */
export function compose(a: Affine, b: Affine): Affine {
  finite(...a, ...b);
  const [aa,ab,ac,ad,ax,ay] = a, [ba,bb,bc,bd,bx,by] = b;
  const out: Affine = [aa*ba+ac*bb, ab*ba+ad*bb, aa*bc+ac*bd, ab*bc+ad*bd, aa*bx+ac*by+ax, ab*bx+ad*by+ay]; finite(...out); return out;
}
export function affine(position: Vec2 = [0,0], rotation = 0, scale: Vec2 = [1,1]): Affine {
  finite(...position, rotation, ...scale);
  if (scale.some(s => Math.abs(s) < 1e-6 || Math.abs(s) > 100)) throw new RangeError("Scale magnitude must be in [1e-6,100]");
  const c = Math.cos(rotation), s = Math.sin(rotation);
  return [c*scale[0], s*scale[0], -s*scale[1], c*scale[1], ...position];
}
export function inverse(matrix: Affine): Affine {
  finite(...matrix); const [a,b,c,d,x,y] = matrix, det = a*d-b*c;
  if (Math.abs(det) <= 1e-12 * Math.max(1, a*a+b*b+c*c+d*d)) throw new RangeError("Transformation is singular or too ill-conditioned to invert");
  const result: Affine = [d/det,-b/det,-c/det,a/det,(c*y-d*x)/det,(b*x-a*y)/det]; finite(...result); return result;
}
export interface IKResult {root: Vec2; middle: Vec2; end: Vec2; requested: Vec2; error: number; reachable: boolean; distance: number;}
/** Exact two-link geometry with radial clamping; no pixel rounding. */
export function solveTwoBone(root: Vec2, target: Vec2, l1: number, l2: number, bend: 1 | -1 = 1, fallbackAngle = 0): IKResult {
  finite(...root, ...target, l1, l2, fallbackAngle);
  if (l1 < 1e-6 || l2 < 1e-6 || l1 > 10000 || l2 > 10000) throw new RangeError("IK bone lengths must be in [1e-6,10000]");
  if (bend !== 1 && bend !== -1) throw new RangeError("IK bend must be +1 or -1");
  const delta = sub(target, root), requestedDistance = length(delta), minimum = Math.abs(l1-l2), maximum = l1+l2;
  const d = Math.max(minimum, Math.min(maximum, requestedDistance));
  const unit: Vec2 = requestedDistance < EPSILON ? [Math.cos(fallbackAngle), Math.sin(fallbackAngle)] : multiply(delta, 1/requestedDistance);
  let middle: Vec2;
  if (d < EPSILON) middle = add(root, multiply([-unit[1], unit[0]], bend*l1));
  else {
    const along = (l1*l1-l2*l2+d*d)/(2*d), height = Math.sqrt(Math.max(0,l1*l1-along*along));
    middle = add(root, [unit[0]*along-unit[1]*height*bend, unit[1]*along+unit[0]*height*bend]);
  }
  const end = add(root, multiply(unit,d)), error = distance(end,target);
  return {root: [...root], middle, end, requested: [...target], error, reachable: error <= 1e-7, distance: d};
}
