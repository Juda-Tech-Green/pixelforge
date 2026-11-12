import {cloneProject,toDocument,type Project} from "@pixelforge/core";
import {distance,type Vec2} from "./math.js";
import {applyPose,forwardKinematics,interpolatePose,solveRigIK,type Diagnostic,type WorldJoint} from "./kinematics.js";
import {parseRig,parsePoses,poseSchema,type Rig,type Poses,type RigAnimation,type Pose} from "./rig-schema.js";
import {renderRig,type SpriteResources} from "./raster.js";
export interface GeneratedFrame {id:string;time:number;durationMs:number;pose:Pose;joints:Record<string,WorldJoint>;diagnostics:Diagnostic[];contacts:{joint:string;target:Vec2;actual:Vec2;error:number}[];}
export function sampleRigAnimation(rigInput:unknown,posesInput:unknown,animationId:string):GeneratedFrame[]{
  const rig=parseRig(rigInput),definitions=parsePoses(posesInput);
  if(definitions.rig!==rig.id)throw new Error("Pose library references another rig");
  const animation=definitions.animations.find(a=>a.id===animationId);if(!animation)throw new Error(`Unknown rig animation ${animationId}`);
  if(rig.canvas.width*rig.canvas.height*Math.max(1,rig.shapes.length)*animation.frames>40_000_000)throw new Error("Animation raster work exceeds 40 million pixel-shape units");
  const byId=new Map(definitions.poses.map(p=>[p.id,p]));
  for(const p of definitions.poses)applyPose(rig,p);
  const output:GeneratedFrame[]=[];
  for(let i=0;i<animation.frames;i++){
    const time=animation.loop?i/animation.frames:animation.frames===1?0:i/(animation.frames-1);
    const keys=animation.keys;let left=keys[0]!,right=keys.at(-1)!;
    for(let k=0;k<keys.length;k++){if(keys[k]!.time<=time)left=keys[k]!;if(keys[k]!.time>=time){right=keys[k]!;break;}}
    if(time>=keys.at(-1)!.time)right=left;
    const u=left===right?0:(time-left.time)/(right.time-left.time);
    let pose=interpolatePose(rig,byId.get(left.pose)!,byId.get(right.pose)!,u,`${animation.id}-${String(i).padStart(3,"0")}`);
    let solved=applyPose(rig,pose);pose=solved.pose;const diagnostics=[...solved.diagnostics],contacts:GeneratedFrame["contacts"]=[];
    for(const c of animation.contacts){
      if(time<c.start||time>c.endTime)continue;
      solved=solveRigIK(rig,pose,{id:c.id,root:c.root,middle:c.middle,end:c.end,position:c.position,bend:c.bend});pose=solved.pose;diagnostics.push(...solved.diagnostics);
      const actual=solved.joints[c.end]!.position,error=distance(actual,c.position);contacts.push({joint:c.end,target:c.position,actual,error});
      if(error>c.tolerance)diagnostics.push({severity:"warning",constraint:"foot-sliding",joint:c.end,frameId:pose.id,actual:error,expected:0,tolerance:c.tolerance,action:"Move pelvis within limb reach or revise the contact interval/target"});
    }
    // The sampled pose is baked after all constraints. Reapplying its original
    // IK targets during rasterization would undo foot-contact corrections.
    pose={...pose,targets:[]};
    const durationMs=Math.floor((i+1)*animation.durationMs/animation.frames)-Math.floor(i*animation.durationMs/animation.frames);
    output.push({id:pose.id,time,durationMs,pose,joints:forwardKinematics(rig,pose),diagnostics,contacts});
  }
  return output;
}
export function generateRigAnimation(rigInput:unknown,posesInput:unknown,animationId:string,options:{existing?:Project;sprites?:SpriteResources;replace?:boolean}={}):{project:Project;frames:GeneratedFrame[];diagnostics:Diagnostic[]}{
  const rig=parseRig(rigInput),definitions=parsePoses(posesInput),frames=sampleRigAnimation(rig,definitions,animationId);
  const outputs=frames.map(f=>renderRig(rig,f.pose,options.sprites).project);
  const project=options.existing?cloneProject(options.existing):outputs[0]!;
  if(project.width!==rig.canvas.width||project.height!==rig.canvas.height||JSON.stringify(project.palette)!==JSON.stringify(rig.palette)||JSON.stringify(project.layers.map(l=>l.id))!==JSON.stringify(rig.layers))throw new Error("Existing sprite canvas, palette or layers do not match rig");
  const prior=project.animations.find(a=>a.name===animationId),ids=new Set(frames.map(f=>f.id));
  if(prior&&!options.replace)throw new Error("Generated animation exists; explicit replace is required");
  if(options.existing){
    const provenance=project.metadata?.pixelforgeGeometry;
    if(prior&&(!provenance||typeof provenance!=="object"||Array.isArray(provenance)||provenance.rig!==rig.id))throw new Error("Existing animation has no matching rig provenance");
    for(const id of ids){
      if(project.frames.some(f=>f.id===id)&&!prior?.frames.some(f=>f.frameId===id))throw new Error(`Frame collision with unrelated source ${id}`);
      if(project.animations.some(a=>a.name!==animationId&&a.frames.some(f=>f.frameId===id)))throw new Error(`Shared generated frame ${id}; preserve other animations before replacement`);
    }
    const generated=new Map(outputs.map(p=>[p.frames[0]!.id,p.frames[0]!]));
    project.frames=project.frames.map(frame=>generated.get(frame.id)??frame);
    const existingIds=new Set(project.frames.map(frame=>frame.id));
    for(const p of outputs)if(!existingIds.has(p.frames[0]!.id))project.frames.push(p.frames[0]!);
  }else project.frames=outputs.map(p=>p.frames[0]!);
  const animation=definitions.animations.find(a=>a.id===animationId)!;
  const replacement={name:animationId,loop:animation.loop,frames:frames.map(f=>({frameId:f.id,durationMs:f.durationMs}))};
  const index=project.animations.findIndex(a=>a.name===animationId);
  if(index>=0)project.animations[index]=replacement;else project.animations.push(replacement);
  project.metadata={...project.metadata,pixelforgeGeometry:{version:"1.0",rig:rig.id,poses:definitions.poses.map(p=>p.id),animation:animationId}};
  toDocument(project);
  return {project,frames,diagnostics:frames.flatMap(f=>f.diagnostics)};
}
export function validateRigSample(rigInput:unknown,poseInput:unknown,observed:Record<string,Vec2>,frameId="sample",tolerance=.25):Diagnostic[]{
  const rig=parseRig(rigInput),pose=poseSchema.parse(poseInput),expected=applyPose(rig,pose).joints,diagnostics:Diagnostic[]=[];
  for(const joint of rig.joints){
    const actual=observed[joint.id];
    if(!actual||actual.some(v=>!Number.isFinite(v))){diagnostics.push({severity:"error",constraint:"disconnected-joint",joint:joint.id,frameId,actual:"missing/nonfinite",expected:"finite joint coordinate",tolerance,action:"Regenerate the pose from the canonical rig"});continue;}
    const drift=distance(actual,expected[joint.id]!.position);
    if(drift>tolerance)diagnostics.push({severity:"warning",constraint:joint.parent===null?"baseline-movement":"joint-position",joint:joint.id,frameId,actual:drift,expected:0,tolerance,action:"Restore the expected pose transform or update the explicit pose"});
    if(joint.parent&&observed[joint.parent]){
      const actualLength=distance(actual,observed[joint.parent]!),length=Math.hypot(...joint.position);
      if(Math.abs(actualLength-length)>tolerance)diagnostics.push({severity:"error",constraint:"bone-length",joint:joint.id,frameId,actual:actualLength,expected:length,tolerance,action:"Solve joint angles/IK rather than moving world joints independently"});
    }
  }
  return diagnostics;
}
