import {mkdir,writeFile} from "node:fs/promises";
import {performance} from "node:perf_hooks";
import {z} from "zod";
import {createProject,createFrame,drawLine,drawRect,drawEllipse,renderFrame,toDocument,type Project} from "@pixelforge/core";
import {encodePNG} from "@pixelforge/exporters";
import {createRig,createPoseLibrary,sampleRigAnimation,applyPose,depthOrder,sceneParts,createInteriorScene,renderRig,restPose,validateScene,sceneTransforms,objectWorld,projectPoint,distance,rasterRound,type Vec2} from "@pixelforge/geometry";
const value=z.number().finite().nonnegative();
const metricsSchema=z.strictObject({frames:value,maxBoneLengthError:value,meanBoneLengthError:value,maxFootTargetError:value,maxFootSlidePerStep:value,headWidthVariance:value,invalidJointRelationships:value,humanVisualQuality:z.number().min(1).max(5).nullable(),renderMs:value});
export const benchmarkResultSchema=z.strictObject({version:z.literal("1.0"),kind:z.literal("controlled-algorithm-comparison"),runtime:z.string(),character:z.strictObject({directPixels:metricsSchema,geometry:metricsSchema}),scene:z.strictObject({directOrder:z.array(z.string()),geometryOrder:z.array(z.string()),directOcclusionViolations:value,geometryOcclusionViolations:value,projectionError:value,groundAnchorError:value,unexpectedOverlapViolations:value,humanCompositionQuality:z.number().min(1).max(5).nullable()}),crossModelEvaluated:z.boolean(),limitations:z.array(z.string())});
const rig=createRig(),poses=createPoseLibrary(rig),animation=poses.animations.find(a=>a.id==="walk")!;
animation.frames=16;
const sampled=sampleRigAnimation(rig,poses,"walk"),worldA=applyPose(rig,poses.poses.find(p=>p.id==="walk-a")!).joints,worldB=applyPose(rig,poses.poses.find(p=>p.id==="walk-b")!).joints;
const direct=sampled.map(frame=>{
  const fraction=frame.time<.5?frame.time*2:2-frame.time*2;
  return Object.fromEntries(rig.joints.map(j=>[j.id,[worldA[j.id]!.position[0]+(worldB[j.id]!.position[0]-worldA[j.id]!.position[0])*fraction,worldA[j.id]!.position[1]+(worldB[j.id]!.position[1]-worldA[j.id]!.position[1])*fraction] as Vec2]));
});
function characterMetrics(worlds:Record<string,Vec2>[],renderMs:number){
  const errors:number[]=[];let missing=0,maxTarget=0,maxSlide=0;
  for(let i=0;i<worlds.length;i++){
    const world=worlds[i]!,previous=worlds[i-1];
    for(const joint of rig.joints){if(!world[joint.id]||(joint.parent&&!world[joint.parent])){missing++;continue;}if(joint.parent)errors.push(Math.abs(distance(world[joint.id]!,world[joint.parent]!)-Math.hypot(...joint.position)));}
    for(const c of animation.contacts)if(sampled[i]!.time>=c.start&&sampled[i]!.time<=c.endTime){maxTarget=Math.max(maxTarget,distance(world[c.end]!,c.position));if(previous&&sampled[i-1]!.time>=c.start&&sampled[i-1]!.time<=c.endTime)maxSlide=Math.max(maxSlide,distance(world[c.end]!,previous[c.end]!));}
  }
  return {frames:worlds.length,maxBoneLengthError:Math.max(0,...errors),meanBoneLengthError:errors.reduce((a,b)=>a+b,0)/Math.max(1,errors.length),maxFootTargetError:maxTarget,maxFootSlidePerStep:maxSlide,headWidthVariance:0,invalidJointRelationships:missing,humanVisualQuality:null,renderMs};
}
function drawDirect(world:Record<string,Vec2>,index:number,project:Project){
  const frame=index===0?project.frames[0]!:createFrame(project,`direct-${String(index).padStart(3,"0")}`);frame.id=`direct-${String(index).padStart(3,"0")}`;
  const point=(id:string)=>world[id]!.map(rasterRound) as Vec2;
  for(const [from,to] of [["left-hip","left-knee"],["left-knee","left-ankle"],["right-hip","right-knee"],["right-knee","right-ankle"],["left-shoulder","left-elbow"],["left-elbow","left-wrist"],["right-shoulder","right-elbow"],["right-elbow","right-wrist"]]){
    const a=point(from!),b=point(to!);for(let x=-1;x<=1;x++)drawLine(project,frame.id,"base",a[0]+x,a[1],b[0]+x,b[1],1);
  }
  const chest=point("chest"),head=point("head");drawRect(project,frame.id,"base",chest[0]-7,chest[1],15,13,2);drawEllipse(project,frame.id,"base",head[0]-5,head[1]-6,11,13,3);
}
const baseline=createProject({name:"Direct pixel reference",width:rig.canvas.width,height:rig.canvas.height,palette:rig.palette});
let start=performance.now();for(let i=0;i<direct.length;i++)drawDirect(direct[i]!,i,baseline);const directMs=performance.now()-start;
start=performance.now();const generated=sampled.map(f=>renderRig(rig,f.pose).project);const geometryMs=performance.now()-start;
const scene=createInteriorScene(),parts=sceneParts(scene),directOrder=[...parts].sort((a,b)=>a.depth-b.depth||(a.id<b.id?-1:1)).map(p=>p.id),geometryOrder=depthOrder(scene).map(p=>p.id);
const constraints=parts.flatMap(p=>[...p.before.map(ref=>({before:p.id,after:ref})),...p.after.map(ref=>({before:ref,after:p.id}))]);
const violations=(order:string[])=>constraints.filter(c=>order.indexOf(c.before)>order.indexOf(c.after)).length;
const transforms=sceneTransforms(scene);
const projectionError=Math.max(0,...scene.objects.map(o=>{const p=objectWorld(o.groundContact,transforms[o.id]!),actual=projectPoint(p,scene.camera),expected:Vec2=[scene.camera.origin[0]+scene.camera.scale*(p[0]-scene.camera.worldOrigin[0]),scene.camera.origin[1]-scene.camera.scale*(p[2]-scene.camera.worldOrigin[2])];return distance(actual,expected);}));
const groundAnchorError=Math.max(0,...scene.constraints.grounded.map(c=>{const o=scene.objects.find(o=>o.id===c.object)!;return Math.abs(objectWorld(o.groundContact,transforms[o.id]!)[2]-c.planeZ);}));
const actor=renderRig(rig,restPose(rig,"idle")).project,unexpectedOverlapViolations=validateScene(scene,{scout:actor}).filter(d=>d.constraint==="unexpected-overlap").length;
const result=benchmarkResultSchema.parse({version:"1.0",kind:"controlled-algorithm-comparison",runtime:process.version,character:{directPixels:characterMetrics(direct,directMs),geometry:characterMetrics(sampled.map(f=>Object.fromEntries(Object.entries(f.joints).map(([id,j])=>[id,j.position]))),geometryMs)},scene:{directOrder,geometryOrder,directOcclusionViolations:violations(directOrder),geometryOcclusionViolations:violations(geometryOrder),projectionError,groundAnchorError,unexpectedOverlapViolations,humanCompositionQuality:null},crossModelEvaluated:false,limitations:["Controlled comparison of world-coordinate interpolation/direct drawing against joint interpolation and constraints; not a claim about the best possible direct workflow.","Bone and foot metrics measure pre-raster geometry for both methods; pixel rounding can add up to half a pixel per axis.","Both methods keep the same explicit head dimensions; head-width variance is zero by construction.","Scene comparison isolates ordering on identical projected parts; projection and declared ground anchors are shared, with side-view projection checked against its closed form.","No human visual/composition ratings or cross-model quality results are fabricated."]});
await mkdir("examples/geometry/benchmark",{recursive:true});
await writeFile("examples/geometry/benchmark/results.schema.json",JSON.stringify(z.toJSONSchema(benchmarkResultSchema),null,2)+"\n");
await writeFile("examples/geometry/benchmark/results.json",JSON.stringify(result,null,2)+"\n");
await writeFile("examples/geometry/benchmark/direct.sprite.json",JSON.stringify(toDocument(baseline))+"\n");
await writeFile("examples/geometry/benchmark/geometry.sprite.json",JSON.stringify(toDocument({...generated[0]!,frames:generated.map(p=>p.frames[0]!)}))+"\n");
await writeFile("examples/geometry/benchmark/direct.png",await encodePNG(renderFrame(baseline,baseline.frames[0]!.id)));
await writeFile("examples/geometry/benchmark/geometry.png",await encodePNG(renderFrame(generated[0]!,generated[0]!.frames[0]!.id)));
console.log(JSON.stringify(result));
