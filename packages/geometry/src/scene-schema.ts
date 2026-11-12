import {z} from "zod";
import {colorSchema} from "@pixelforge/core";
import {cameraSchema,vec2Schema,vec3Schema} from "./projection.js";
import {geometryIdSchema as id} from "./rig-schema.js";
const color=z.number().int().min(1).max(255),orderRef=z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}(?::[A-Za-z][A-Za-z0-9_-]{0,63})?$/);
export const sceneGeometrySchema=z.discriminatedUnion("type",[
  z.strictObject({type:z.literal("box"),color,sideColor:color.optional(),topColor:color.optional(),outline:z.number().int().min(0).max(255).default(0),size:z.tuple([z.number().finite().positive().max(1024),z.number().finite().positive().max(1024),z.number().finite().positive().max(1024)]).optional()}),
  z.strictObject({type:z.literal("polygon"),color,outline:z.number().int().min(0).max(255).default(0),points:z.array(vec3Schema).min(3).max(32)}),
]);
const sprite=z.strictObject({asset:id,frame:z.string().min(1).max(128),anchor:vec2Schema.default([0,0])});
const depthGroup=z.enum(["background","midground","actors","foreground"]);
export const sceneObjectSchema=z.strictObject({
  id,type:id,parent:id.optional(),position:vec3Schema,rotation:z.number().finite().min(-Math.PI).max(Math.PI).default(0),
  scale:z.tuple([z.number().finite().min(.01).max(20),z.number().finite().min(.01).max(20),z.number().finite().min(.01).max(20)]).default([1,1,1]),
  size:z.tuple([z.number().finite().positive().max(1024),z.number().finite().positive().max(1024),z.number().finite().positive().max(1024)]).default([8,8,8]),
  footprint:z.array(vec2Schema).min(3).max(16).optional(),anchors:z.record(id,vec3Schema).refine(x=>Object.keys(x).length<=32).default({}),groundContact:vec3Schema.default([0,0,0]),
  depthGroup:depthGroup.default("midground"),renderLayer:z.number().int().min(-128).max(128).default(0),depthOffset:z.number().finite().min(-10000).max(10000).default(0),
  before:z.array(orderRef).max(64).default([]),after:z.array(orderRef).max(64).default([]),geometry:sceneGeometrySchema.optional(),sprite:sprite.optional(),
  parts:z.array(z.strictObject({id,offset:vec3Schema.default([0,0,0]),depthGroup:depthGroup.optional(),renderLayer:z.number().int().min(-128).max(128).optional(),depthOffset:z.number().finite().min(-10000).max(10000).default(0),before:z.array(orderRef).max(64).default([]),after:z.array(orderRef).max(64).default([]),geometry:sceneGeometrySchema.optional(),sprite:sprite.optional()})).max(16).default([]),
});
export const sceneSchema=z.strictObject({
  version:z.literal("1.0"),id,name:z.string().min(1).max(128),canvas:z.strictObject({width:z.number().int().min(1).max(512),height:z.number().int().min(1).max(512)}),
  camera:cameraSchema,palette:z.array(colorSchema).min(2).max(256),objects:z.array(sceneObjectSchema).max(128),
  regions:z.array(z.strictObject({id,kind:z.enum(["background","foreground","ground","allowed"]),polygon:z.array(vec2Schema).min(3).max(32),z:z.number().finite().min(-10000).max(10000).default(0)})).max(32).default([]),
  constraints:z.strictObject({
    noOverlap:z.array(z.tuple([id,id])).max(128).default([]),
    grounded:z.array(z.strictObject({object:id,planeZ:z.number().finite().min(-10000).max(10000).default(0),tolerance:z.number().finite().min(0).max(10).default(.1)})).max(128).default([]),
    anchors:z.array(z.strictObject({object:id,anchor:id,other:id,otherAnchor:id,tolerance:z.number().finite().min(0).max(100).default(.25)})).max(128).default([]),
  }).default({noOverlap:[],grounded:[],anchors:[]}),
}).superRefine((s,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:"custom",message}),byId=new Map(s.objects.map(o=>[o.id,o]));
  if(byId.size!==s.objects.length)fail("Scene object IDs must be unique");
  if(s.palette[0]!.some(v=>v!==0))fail("Palette index0 must be transparent");
  let parts=0;
  for(const o of s.objects){
    if(o.parent&&!byId.has(o.parent))fail(`${o.id}: missing scene parent ${o.parent}`);
    const visited=new Set<string>();let current:string|undefined=o.id;
    while(current){if(visited.has(current)){fail(`${o.id}: scene parent cycle at ${current}`);break;}visited.add(current);current=byId.get(current)?.parent;}
    if(new Set(o.parts.map(p=>p.id)).size!==o.parts.length)fail(`${o.id}: duplicate part IDs`);
    if(o.parts.length&&(o.geometry||o.sprite))fail(`${o.id}: put render geometry on parts when using split-object rendering`);
    parts+=Math.max(1,o.parts.length);
    for(const part of [o,...o.parts])if(part.geometry){
      const g=part.geometry;for(const c of [g.color,g.outline,...(g.type==="box"?[g.sideColor,g.topColor]:[])])if(c!==undefined&&c>=s.palette.length)fail(`${o.id}: geometry references a missing palette color`);
    }
    if(o.footprint){
      if(new Set(o.footprint.map(p=>p.join(","))).size!==o.footprint.length)fail(`${o.id}: footprint has duplicate vertices`);
      let sign=0;
      for(let i=0;i<o.footprint.length;i++){
        const a=o.footprint[i]!,b=o.footprint[(i+1)%o.footprint.length]!,c=o.footprint[(i+2)%o.footprint.length]!;
        const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
        if(Math.abs(cross)<1e-9)continue;
        if(sign&&Math.sign(cross)!==sign)fail(`${o.id}: footprint must be convex; split concave footprints into convex objects`);
        sign=Math.sign(cross);
      }
      if(!sign)fail(`${o.id}: footprint has zero area`);
      for(let i=0;i<o.footprint.length;i++){
        const a=o.footprint[i]!,b=o.footprint[(i+1)%o.footprint.length]!;
        const sides=o.footprint.map(p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]));
        if(sides.some(v=>v>1e-9)&&sides.some(v=>v< -1e-9))fail(`${o.id}: footprint crosses a supporting edge; use a convex non-self-intersecting polygon`);
      }
    }
  }
  if(parts>256||parts*s.canvas.width*s.canvas.height>40_000_000)fail("Scene render work exceeds 256 parts or 40 million pixel-part units");
  for(const pair of s.constraints.noOverlap)for(const object of pair)if(!byId.has(object))fail(`noOverlap references missing object ${object}`);
  for(const g of s.constraints.grounded)if(!byId.has(g.object))fail(`Ground constraint references missing object ${g.object}`);
  for(const a of s.constraints.anchors)if(!byId.get(a.object)?.anchors[a.anchor]||!byId.get(a.other)?.anchors[a.otherAnchor])fail("Anchor constraint references a missing object/anchor");
});
export type Scene=z.infer<typeof sceneSchema>;
export type SceneObject=z.infer<typeof sceneObjectSchema>;
export type SceneGeometry=z.infer<typeof sceneGeometrySchema>;
export function parseScene(input:unknown):Scene{return sceneSchema.parse(input);}
