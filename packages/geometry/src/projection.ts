import { z } from "zod";
import { finite, type Vec2, type Vec3 } from "./math.js";
const coordinate = z.number().finite().min(-10000).max(10000);
export const vec2Schema = z.tuple([coordinate,coordinate]);
export const vec3Schema = z.tuple([coordinate,coordinate,coordinate]);
export const cameraSchema = z.strictObject({
  projection: z.enum(["side-view", "top-down", "three-quarter"]),
  origin: vec2Schema.default([0,0]),
  worldOrigin: vec3Schema.default([0,0,0]),
  scale: z.number().finite().min(0.01).max(100).default(1),
  axes: z.tuple([vec2Schema,vec2Schema,vec2Schema]).optional(),
}).superRefine((c, ctx) => {
  if (c.axes && c.projection !== "three-quarter") ctx.addIssue({code: "custom", message: "Custom axes require three-quarter projection"});
  if (c.axes) {
    const [x,y,z] = c.axes;
    const determinant = (a: Vec2,b: Vec2) => a[0]*b[1]-a[1]*b[0];
    if (Math.max(Math.abs(determinant(x,y)),Math.abs(determinant(x,z)),Math.abs(determinant(y,z))) < 1e-9) ctx.addIssue({code:"custom",message:"Projection axes must span a screen plane"});
  }
});
export type Camera = z.infer<typeof cameraSchema>;
function basis(c: Camera): [Vec2,Vec2,Vec2] {
  return c.projection === "side-view" ? [[1,0],[0,0],[0,-1]] : c.projection === "top-down" ? [[1,0],[0,1],[0,0]] : c.axes ?? [[1,0.5],[-1,0.5],[0,-1]];
}
export function projectPoint(point: Vec3, input: Camera): Vec2 {
  finite(...point); const c = cameraSchema.parse(input), axes = basis(c);
  return [0,1].map(axis => c.origin[axis]! + c.scale * axes.reduce((sum, vector, i) => sum + (point[i]! - c.worldOrigin[i]!) * vector[axis]!, 0)) as Vec2;
}
export function unprojectPoint(screen: Vec2, input: Camera, plane: {axis: "x" | "y" | "z"; value: number} = {axis:"z",value:0}): Vec3 {
  finite(...screen,plane.value); const c = cameraSchema.parse(input), axes = basis(c), fixed = {x:0,y:1,z:2}[plane.axis];
  if (fixed === undefined) throw new Error("Choose an x, y or z inverse-projection plane");
  const free = [0,1,2].filter(i=>i!==fixed), a = axes[free[0]!]!, b = axes[free[1]!]!;
  const det = a[0]*b[1]-a[1]*b[0];
  if (Math.abs(det)<1e-9) throw new Error(`Projection is not invertible on ${plane.axis}=${plane.value}; choose a visible plane`);
  const delta = plane.value-c.worldOrigin[fixed]!;
  const sx = (screen[0]-c.origin[0])/c.scale-axes[fixed]![0]*delta, sy = (screen[1]-c.origin[1])/c.scale-axes[fixed]![1]*delta;
  const result: Vec3 = [...c.worldOrigin]; result[fixed] = plane.value;
  const first = free[0]!, second = free[1]!;
  result[first] = result[first]! + (sx*b[1]-sy*b[0])/det; result[second] = result[second]! + (a[0]*sy-a[1]*sx)/det;
  finite(...result); return result;
}
export function projectBounds(minimum: Vec3, maximum: Vec3, camera: Camera) {
  finite(...minimum,...maximum); if (minimum.some((v,i)=>v>maximum[i]!)) throw new Error("Invalid bounding-box extent");
  const points: Vec2[] = [];
  for (const x of [minimum[0],maximum[0]]) for (const y of [minimum[1],maximum[1]]) for (const z of [minimum[2],maximum[2]]) points.push(projectPoint([x,y,z],camera));
  return {min: [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))] as Vec2,max:[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))] as Vec2};
}
