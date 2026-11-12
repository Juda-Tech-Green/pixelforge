import {affine,compose,transform,inverse,wrapAngle,distance,solveTwoBone,interpolateAngle,type Affine,type Vec2} from "./math.js";
import {parseRig,poseSchema,type Rig,type Pose,type IKTarget} from "./rig-schema.js";

export interface Diagnostic {severity:"error"|"warning";constraint:string;joint?:string;frameId?:string;actual:number|Vec2|string;expected:number|Vec2|string;tolerance:number;action:string;}
export interface WorldJoint {id:string;position:Vec2;angle:number;matrix:Affine;length:number;}
export interface SolvedPose {pose:Pose;joints:Record<string,WorldJoint>;diagnostics:Diagnostic[];}
export function restPose(rig:Rig,id="rest"):Pose{return poseSchema.parse({id,rotations:Object.fromEntries(rig.joints.map(j=>[j.id,j.rotation]))});}
export function forwardKinematics(input:unknown,poseInput:unknown):Record<string,WorldJoint>{
  const rig=parseRig(input),pose=poseSchema.parse(poseInput), out:Record<string,WorldJoint>=Object.create(null) as Record<string,WorldJoint>;
  const known=new Set(rig.joints.map(j=>j.id));
  for(const id of Object.keys(pose.rotations))if(!known.has(id))throw new Error(`Pose references unknown joint ${id}`);
  let pending=[...rig.joints];
  for(let pass=0;pending.length>0&&pass<rig.joints.length;pass++){
    const next=[];
    for(const joint of pending){
      if(joint.parent&&!out[joint.parent]){next.push(joint);continue;}
      const angle=pose.rotations[joint.id]??joint.rotation;
      if(angle<joint.limits[0]-1e-9||angle>joint.limits[1]+1e-9)throw new Error(`${joint.id}: angle ${angle} outside limits [${joint.limits}]`);
      const position:Vec2=joint.parent?[...joint.position]:[joint.position[0]+pose.rootTranslation[0],joint.position[1]+pose.rootTranslation[1]];
      const rootMatrix:Affine=pose.facing==="left"?[-1,0,0,1,rig.canvas.width-1,0]:[1,0,0,1,0,0];
      const matrix=compose(joint.parent?out[joint.parent]!.matrix:rootMatrix,affine(position,angle));
      out[joint.id]={id:joint.id,position:transform([0,0],matrix),angle:Math.atan2(matrix[1],matrix[0]),matrix,length:joint.parent?Math.hypot(...joint.position):0};
    }
    if(next.length===pending.length)throw new Error("Rig hierarchy cannot be resolved");pending=next;
  }
  if(pending.length)throw new Error("Rig hierarchy traversal limit exceeded");
  return out;
}
function constrainedAngle(rig:Rig,pose:Pose,id:string,angle:number,diagnostics:Diagnostic[]){
  const joint=rig.joints.find(j=>j.id===id)!;angle=wrapAngle(angle);
  const limited=Math.max(joint.limits[0],Math.min(joint.limits[1],angle));
  if(Math.abs(limited-angle)>1e-8)diagnostics.push({severity:"warning",constraint:"joint-limit",joint:id,actual:angle,expected:limited,tolerance:1e-8,action:"Move the target or widen the explicit joint limits"});
  pose.rotations[id]=limited;
}
export function solveRigIK(input:unknown,poseInput:unknown,target:IKTarget):SolvedPose{
  const rig=parseRig(input),pose=poseSchema.parse(poseInput),diagnostics:Diagnostic[]=[];
  // Validate the standalone target too; callers need not come through a pose file.
  const t=poseSchema.parse({...pose,targets:[target]}).targets[0]!;
  const a=rig.joints.find(j=>j.id===t.root),b=rig.joints.find(j=>j.id===t.middle),c=rig.joints.find(j=>j.id===t.end);
  if(!a||!b||!c||b.parent!==a.id||c.parent!==b.id)throw new Error(`${t.id}: IK requires a direct root-middle-end chain`);
  const before=forwardKinematics(rig,pose),root=before[a.id]!,parentAngle=a.parent?before[a.parent]!.angle:pose.facing==="left"?Math.PI:0;
  const parity=pose.facing==="left"?-1:1;
  const result=solveTwoBone(root.position,t.position,Math.hypot(...b.position),Math.hypot(...c.position),t.bend,root.angle+parity*Math.atan2(b.position[1],b.position[0]));
  const upper=Math.atan2(result.middle[1]-result.root[1],result.middle[0]-result.root[0])-parity*Math.atan2(b.position[1],b.position[0]);
  const lower=Math.atan2(result.end[1]-result.middle[1],result.end[0]-result.middle[0])-parity*Math.atan2(c.position[1],c.position[0]);
  constrainedAngle(rig,pose,a.id,parity*(upper-parentAngle),diagnostics);
  constrainedAngle(rig,pose,b.id,parity*(lower-upper),diagnostics);
  const joints=forwardKinematics(rig,pose),error=distance(joints[c.id]!.position,t.position);
  if(error>1e-6)diagnostics.push({severity:"warning",constraint:"ik-target",joint:c.id,actual:error,expected:0,tolerance:1e-6,action:"Bring target within reach and allowed joint angles"});
  return {pose,joints,diagnostics};
}
export function applyPose(input:unknown,poseInput:unknown):SolvedPose{
  const rig=parseRig(input);let pose=poseSchema.parse(poseInput);const diagnostics:Diagnostic[]=[];
  for(const target of pose.targets){const solved=solveRigIK(rig,pose,target);pose=solved.pose;diagnostics.push(...solved.diagnostics);}
  return {pose,joints:forwardKinematics(rig,pose),diagnostics};
}
export function interpolatePose(input:unknown,aInput:unknown,bInput:unknown,t:number,id="interpolated"):Pose{
  const rig=parseRig(input),a=poseSchema.parse(aInput),b=poseSchema.parse(bInput);
  if(!Number.isFinite(t)||t<0||t>1)throw new Error("Pose fraction must be in [0,1]");
  const rotations:Record<string,number>={};
  for(const j of rig.joints){
    const start=a.rotations[j.id]??j.rotation,end=b.rotations[j.id]??j.rotation;
    const shortest=interpolateAngle(start,end,t);
    // A wrapped shortest path may cross a forbidden joint interval. Use the
    // direct path inside the convex interval instead, without changing lengths.
    rotations[j.id]=shortest>=j.limits[0]&&shortest<=j.limits[1]?shortest:start+(end-start)*t;
  }
  const firstWorld=applyPose(rig,a).joints,secondWorld=applyPose(rig,b).joints;
  const targetIds=[...new Set([...a.targets,...b.targets].map(target=>target.id))];
  const targets=targetIds.map(targetId=>{
    const first=a.targets.find(target=>target.id===targetId),second=b.targets.find(target=>target.id===targetId),target=first??second!;
    if(first&&second&&(first.root!==second.root||first.middle!==second.middle||first.end!==second.end||first.bend!==second.bend))throw new Error(`${target.id}: incompatible IK interpolation chain`);
    const start=first?.position??firstWorld[target.end]!.position,end=second?.position??secondWorld[target.end]!.position;
    return {...target,position:[start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t] as Vec2};
  });
  return poseSchema.parse({id,facing:t===1?b.facing:a.facing,rotations,rootTranslation:[a.rootTranslation[0]+(b.rootTranslation[0]-a.rootTranslation[0])*t,a.rootTranslation[1]+(b.rootTranslation[1]-a.rootTranslation[1])*t],targets});
}
export function mirrorPose(input:unknown,poseInput:unknown,id="mirrored"):Pose{
  const rig=parseRig(input),pose=poseSchema.parse(poseInput),root=rig.joints.find(j=>j.parent===null)!;
  const map=(id:string)=>rig.joints.find(j=>j.id===id)?.mirror??id;
  return poseSchema.parse({id,facing:pose.facing,rootTranslation:[-pose.rootTranslation[0],pose.rootTranslation[1]],rotations:Object.fromEntries(rig.joints.map(j=>[map(j.id),wrapAngle(-(pose.rotations[j.id]??j.rotation))])),targets:pose.targets.map(t=>({...t,root:map(t.root),middle:map(t.middle),end:map(t.end),position:[2*root.position[0]-t.position[0],t.position[1]],bend:-t.bend}))});
}
/** Change projected facing without exchanging anatomical joint identities. */
export function facePose(input:unknown,poseInput:unknown,facing:"right"|"left",id="facing"):Pose{
  const rig=parseRig(input),pose=poseSchema.parse(poseInput);
  return poseSchema.parse({...pose,id,facing,targets:pose.targets.map(t=>({...t,position:facing===pose.facing?t.position:[rig.canvas.width-1-t.position[0],t.position[1]],bend:facing===pose.facing?t.bend:-t.bend}))});
}
export function composePoses(aInput:unknown,bInput:unknown,id="composed"):Pose{
  const a=poseSchema.parse(aInput),b=poseSchema.parse(bInput);
  const targets=new Map([...a.targets,...b.targets].map(t=>[t.id,t]));
  return poseSchema.parse({id,facing:b.facing,rotations:{...a.rotations,...b.rotations},rootTranslation:[a.rootTranslation[0]+b.rootTranslation[0],a.rootTranslation[1]+b.rootTranslation[1]],targets:[...targets.values()]});
}
export function comparePoses(rig:Rig,a:Pose,b:Pose){
  const left=applyPose(rig,a).joints,right=applyPose(rig,b).joints;
  return rig.joints.map(j=>({joint:j.id,distance:distance(left[j.id]!.position,right[j.id]!.position),angle:wrapAngle(right[j.id]!.angle-left[j.id]!.angle)}));
}
export function moveRigJoint(input:unknown,poseInput:unknown,id:string,position:Vec2):Rig{
  const rig=parseRig(input),pose=poseSchema.parse(poseInput),joint=rig.joints.find(j=>j.id===id);
  if(!joint)throw new Error(`Unknown joint ${id}`);
  const world=applyPose(rig,pose).joints;
  if(joint.parent)joint.position=transform(position,inverse(world[joint.parent]!.matrix));
  else joint.position=[(pose.facing==="left"?rig.canvas.width-1-position[0]:position[0])-pose.rootTranslation[0],position[1]-pose.rootTranslation[1]];
  return parseRig(rig);
}
