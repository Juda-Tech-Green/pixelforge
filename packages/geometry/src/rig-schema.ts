import { z } from "zod";
import { colorSchema } from "@pixelforge/core";
import { vec2Schema } from "./projection.js";
export const geometryIdSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
const id = geometryIdSchema;
const angle = z.number().finite().min(-Math.PI).max(Math.PI);
const dimension = z.number().finite().min(0.01).max(512);
const index = z.number().int().min(1).max(255);
const attached = {id, joint: id, layer: id, color: index, outline: z.number().int().min(0).max(255).default(0), offset: vec2Schema.default([0,0]), rotation: angle.default(0)};
export const bodyShapeSchema = z.discriminatedUnion("type", [
  z.strictObject({...attached, type: z.literal("ellipse"), radius: z.tuple([dimension,dimension])}),
  z.strictObject({...attached, type: z.literal("polygon"), points: z.array(vec2Schema).min(3).max(32)}),
  z.strictObject({...attached, type: z.literal("bone"), end: id, width: dimension}),
  z.strictObject({...attached, type: z.literal("sprite"), asset: id, frame: z.string().min(1).max(128), scale: z.number().finite().min(0.1).max(10).default(1)}),
]);
export const rigSchema = z.strictObject({
  version: z.literal("1.0"), id, name: z.string().min(1).max(128),
  canvas: z.strictObject({width: z.number().int().min(1).max(256),height: z.number().int().min(1).max(256)}),
  palette: z.array(colorSchema).min(2).max(256),
  layers: z.array(id).min(1).max(16),
  joints: z.array(z.strictObject({id, parent: id.nullable(), position: vec2Schema, rotation: angle.default(0), limits: z.tuple([angle,angle]).default([-Math.PI,Math.PI]), mirror: id.optional()})).min(1).max(128),
  shapes: z.array(bodyShapeSchema).max(256),
  proportions: z.record(id, dimension).refine(x=>Object.keys(x).length<=32).default({}),
  metadata: z.record(z.string().max(64), z.string().max(1024)).refine(x=>Object.keys(x).length<=32).optional(),
}).superRefine((r,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:"custom",message});
  const ids=new Set(r.joints.map(j=>j.id)), layers=new Set(r.layers);
  if(ids.size!==r.joints.length) fail("Joint IDs must be unique");
  if(layers.size!==r.layers.length) fail("Layer IDs must be unique");
  if(new Set(r.shapes.map(s=>s.id)).size!==r.shapes.length) fail("Shape IDs must be unique");
  if(r.joints.filter(j=>j.parent===null).length!==1) fail("A rig must have exactly one root joint");
  if(r.palette[0]!.some(v=>v!==0)) fail("Palette index0 must be transparent RGBA[0,0,0,0]");
  const byId=new Map(r.joints.map(j=>[j.id,j]));
  for(const j of r.joints){
    if(j.parent!==null&&!ids.has(j.parent)) fail(`${j.id}: missing parent ${j.parent}`);
    if(j.parent!==null&&Math.hypot(...j.position)<1e-6) fail(`${j.id}: bone length must exceed 1e-6`);
    if(j.limits[0]>j.limits[1]||j.rotation<j.limits[0]||j.rotation>j.limits[1]) fail(`${j.id}: invalid limits/rest rotation`);
    if(j.mirror&&!ids.has(j.mirror)) fail(`${j.id}: missing mirror joint ${j.mirror}`);
    const visited=new Set<string>(); let current: string|null=j.id;
    for(let step=0;current!==null&&step<=r.joints.length;step++){
      if(visited.has(current)){fail(`${j.id}: hierarchy cycle at ${current}`);break;}
      visited.add(current);current=byId.get(current)?.parent??null;
    }
  }
  for(const s of r.shapes){
    if(!ids.has(s.joint)) fail(`${s.id}: missing attachment joint ${s.joint}`);
    if(s.type==="bone"&&!ids.has(s.end)) fail(`${s.id}: missing endpoint ${s.end}`);
    if(!layers.has(s.layer)) fail(`${s.id}: missing layer ${s.layer}`);
    if(s.color>=r.palette.length||s.outline>=r.palette.length) fail(`${s.id}: missing palette color`);
  }
  if(r.canvas.width*r.canvas.height*Math.max(1,r.shapes.length)>8_000_000) fail("Rig raster work exceeds 8 million pixel-shape units");
});
export const ikTargetSchema = z.strictObject({id, root:id, middle:id, end:id, position:vec2Schema, bend:z.union([z.literal(1),z.literal(-1)]).default(1)});
export const poseSchema=z.strictObject({id, facing:z.enum(["right","left"]).default("right"),rotations:z.record(id,angle).refine(x=>Object.keys(x).length<=128).default({}),rootTranslation:vec2Schema.default([0,0]),targets:z.array(ikTargetSchema).max(16).default([])}).superRefine((p,ctx)=>{if(new Set(p.targets.map(t=>t.id)).size!==p.targets.length)ctx.addIssue({code:"custom",message:"IK target IDs must be unique"});});
export const animationSchema=z.strictObject({
  id, loop:z.boolean().default(true), frames:z.number().int().min(1).max(128), durationMs:z.number().int().min(1).max(60000),
  keys:z.array(z.strictObject({time:z.number().finite().min(0).max(1),pose:id})).min(1).max(64),
  contacts:z.array(z.strictObject({id,root:id,middle:id,end:id,position:vec2Schema,bend:z.union([z.literal(1),z.literal(-1)]).default(1),start:z.number().finite().min(0).max(1),endTime:z.number().finite().min(0).max(1),tolerance:z.number().finite().min(0).max(10).default(0.25)})).max(32).default([]),
}).superRefine((a,ctx)=>{
  if(a.durationMs<a.frames)ctx.addIssue({code:"custom",message:"Animation needs at least1 ms per frame"});
  if(a.keys[0]!.time!==0||a.keys.some((k,i)=>i>0&&k.time<=a.keys[i-1]!.time))ctx.addIssue({code:"custom",message:"Key times must begin at0 and strictly increase"});
  if(a.contacts.some(c=>c.start>c.endTime))ctx.addIssue({code:"custom",message:"Contact interval start exceeds end"});
});
export const posesSchema=z.strictObject({version:z.literal("1.0"),rig:id,poses:z.array(poseSchema).min(1).max(128),animations:z.array(animationSchema).max(32).default([])}).superRefine((p,ctx)=>{
  const ids=new Set(p.poses.map(p=>p.id));
  if(ids.size!==p.poses.length||new Set(p.animations.map(a=>a.id)).size!==p.animations.length)ctx.addIssue({code:"custom",message:"Pose/animation IDs must be unique"});
  for(const a of p.animations) for(const k of a.keys)if(!ids.has(k.pose))ctx.addIssue({code:"custom",message:`${a.id}: missing pose ${k.pose}`});
});
export type Rig=z.infer<typeof rigSchema>;
export type Joint=Rig["joints"][number];
export type BodyShape=z.infer<typeof bodyShapeSchema>;
export type Pose=z.infer<typeof poseSchema>;
export type Poses=z.infer<typeof posesSchema>;
export type RigAnimation=z.infer<typeof animationSchema>;
export type IKTarget=z.infer<typeof ikTargetSchema>;
export function parseRig(input:unknown):Rig{return rigSchema.parse(input);}
export function parsePoses(input:unknown):Poses{return posesSchema.parse(input);}
