import {z} from "zod";
import {renderFrame} from "@pixelforge/core";
import {geometryIdSchema,parseRig,poseSchema,type Rig,type Pose} from "./rig-schema.js";
import {vec2Schema} from "./projection.js";
import {distance,transform,type Vec2} from "./math.js";
import {applyPose,type Diagnostic} from "./kinematics.js";
import {renderRig,type SpriteResources} from "./raster.js";
import {validateRigSample} from "./rig-animation.js";
export const observationsSchema=z.array(z.strictObject({
  frameId:geometryIdSchema,pose:poseSchema,joints:z.record(geometryIdSchema,vec2Schema).refine(j=>Object.keys(j).length<=128),
  measurements:z.record(geometryIdSchema,z.number().finite().min(0).max(10000)).refine(m=>Object.keys(m).length<=32).default({}),
  attachments:z.record(geometryIdSchema,vec2Schema).refine(a=>Object.keys(a).length<=256).default({}),
  bounds:z.strictObject({min:vec2Schema,max:vec2Schema}).optional(),
})).min(1).max(128);
export function measureRig(rigInput:unknown,poseInput:unknown,sprites:SpriteResources={}){
  const rig=parseRig(rigInput),pose=poseSchema.parse(poseInput),solved=applyPose(rig,pose),raster=renderFrame(renderRig(rig,pose,sprites).project,pose.id);
  let minX=rig.canvas.width,minY=rig.canvas.height,maxX=-1,maxY=-1;
  for(let y=0;y<raster.height;y++)for(let x=0;x<raster.width;x++)if(raster.data[(y*raster.width+x)*4+3]){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  return {joints:Object.fromEntries(Object.entries(solved.joints).map(([id,j])=>[id,j.position])),measurements:{...rig.proportions},attachments:Object.fromEntries(rig.shapes.map(shape=>[shape.id,transform(shape.offset,solved.joints[shape.joint]!.matrix)])),bounds:maxX<0?null:{min:[minX,minY] as Vec2,max:[maxX,maxY] as Vec2},diagnostics:solved.diagnostics};
}
export function validateCharacterConsistency(input:unknown,observationsInput:unknown,options:{tolerance?:number;sprites?:SpriteResources}={}):Diagnostic[]{
  const rig=parseRig(input),observations=observationsSchema.parse(observationsInput),tolerance=options.tolerance??.25,report:Diagnostic[]=[];
  if(!Number.isFinite(tolerance)||tolerance<0||tolerance>10)throw new Error("Consistency tolerance must be in [0,10]");
  if(observations.length*rig.canvas.width*rig.canvas.height*Math.max(1,rig.shapes.length)>40_000_000)throw new Error("Consistency raster work limit exceeded");
  for(const frame of observations){
    report.push(...validateRigSample(rig,frame.pose,frame.joints,frame.frameId,tolerance));
    const measured=measureRig(rig,frame.pose,options.sprites);
    for(const [name,actual] of Object.entries(frame.measurements)){
      const expected=rig.proportions[name];
      if(expected===undefined)throw new Error(`Unknown declared proportion ${name}`);
      if(Math.abs(actual-expected)>tolerance)report.push({severity:"warning",constraint:name.toLowerCase().includes("head")?"head-size":name.toLowerCase().includes("torso")?"torso-proportion":"proportion",frameId:frame.frameId,actual,expected,tolerance,action:`Restore ${name} to the selected rig proportions, or explicitly select a different proportion preset`});
    }
    for(const [id,position] of Object.entries(frame.attachments)){
      const expected=measured.attachments[id];if(!expected)throw new Error(`Unknown attachment ${id}`);
      const error=distance(position,expected);if(error>tolerance)report.push({severity:"warning",constraint:"attachment-position",frameId:frame.frameId,joint:id,actual:error,expected:0,tolerance,action:"Apply the parent joint transform to the attachment offset"});
    }
    if(frame.bounds&&measured.bounds){
      const error=Math.max(distance(frame.bounds.min,measured.bounds.min),distance(frame.bounds.max,measured.bounds.max));
      if(error>tolerance)report.push({severity:"warning",constraint:"character-bounds",frameId:frame.frameId,actual:error,expected:0,tolerance,action:"Inspect canvas clipping, lost attachments or unintended shape scaling"});
    }
  }
  return report;
}
