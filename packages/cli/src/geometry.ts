import type {Command} from "commander";
import {readFile,lstat} from "node:fs/promises";
import {resolve} from "node:path";
import {fromDocument,serializeProject,type Project} from "@pixelforge/core";
import {assertNoSymlinkPath,exportFramePNG} from "@pixelforge/exporters";
import {createRig,createPoseLibrary,rigPresetNames,parseRig,poseSchema,restPose,forwardKinematics,applyPose,solveRigIK,renderRig,generateRigAnimation,createInteriorScene,parseScene,validateScene,depthOrder,renderScene,validateCharacterConsistency,type Rig,type Pose,type RigPresetName,type SpriteResources,type Diagnostic} from "@pixelforge/geometry";
const report=(data:unknown):void=>{process.stdout.write(JSON.stringify(data)+"\n");};
const text=(data:unknown)=>JSON.stringify(data,null,2)+"\n";
const pair=(value:string):[number,number]=>{const parts=value.split(",").map(Number);if(parts.length!==2||parts.some(v=>!Number.isFinite(v)||Math.abs(v)>10000))throw new Error("Expected finite x,y within±10000");return [parts[0]!,parts[1]!];};
const number=(value:string)=>{const n=Number(value);if(!Number.isFinite(n))throw new Error("Expected a finite number");return n;};
const collect=(value:string,previous:string[])=>[...previous,value];
const json=async(file:string,max=2_097_152):Promise<unknown>=>{const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>max)throw new Error(`Input must be a regular file up to${max} bytes`);return JSON.parse(await readFile(file,"utf8")) as unknown;};
async function resources(assets:string[]=[]):Promise<SpriteResources>{
  if(assets.length>32)throw new Error("At most32 sprite resources are allowed");
  const result:SpriteResources=Object.create(null) as SpriteResources;
  for(const item of assets){const split=item.indexOf("=");if(split<1)throw new Error("Use --asset ID=SPRITE_FILE");const id=item.slice(0,split),file=item.slice(split+1);if(Object.hasOwn(result,id))throw new Error(`Duplicate sprite resource ${id}`);result[id]=fromDocument(await json(file,67_108_864));}
  return result;
}
function summarized(diagnostics:Diagnostic[]){return {ok:!diagnostics.some(d=>d.severity==="error"),diagnostics:diagnostics.slice(0,64),diagnosticsTotal:diagnostics.length};}
export function registerGeometryCommands(program:Command,atomicWrite:(path:string,data:string|Uint8Array)=>Promise<void>):void{
  const canWrite=async(output:string,force=false,inputs:string[]=[])=>{
    const path=resolve(output);if(inputs.some(input=>resolve(input).toLowerCase()===path.toLowerCase()))throw new Error("Output cannot overwrite a geometry source file");
    await assertNoSymlinkPath(path);
    try{await lstat(path);if(!force)throw new Error("Output exists; use --force only to replace an explicitly selected output file");}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
  };
  const write=async(output:string,data:string|Uint8Array,force=false,inputs:string[]=[])=>{await canWrite(output,force,inputs);await atomicWrite(output,data);};
  const loadPose=async(rig:Rig,file?:string):Promise<Pose>=>file?poseSchema.parse(await json(file)):restPose(rig);
  const renderOutput=async(project:Project,o:{output:string;sprite?:string;force?:boolean},inputs:string[])=>{
    if(o.sprite&&resolve(o.output).toLowerCase()===resolve(o.sprite).toLowerCase())throw new Error("PNG and sprite outputs must differ");
    await canWrite(o.output,o.force,inputs);if(o.sprite)await canWrite(o.sprite,o.force,inputs);
    const png=await exportFramePNG(project,project.frames[0]!.id),definition=serializeProject(project);
    await write(o.output,png,o.force,inputs);if(o.sprite)await write(o.sprite,definition,o.force,inputs);
  };
  const rig=program.command("rig").description("Construct, constrain and rasterize editable character geometry");
  rig.command("create").argument("<name>").option("--preset <preset>",rigPresetNames.join(", "),"standard").requiredOption("-o, --output <file>").option("--poses <file>","Also create the reusable pose library").option("--force").action(async(name:string,o:{preset:string;output:string;poses?:string;force?:boolean})=>{
    if(!rigPresetNames.includes(o.preset as RigPresetName))throw new Error("Unknown rig preset");
    const created=parseRig({...createRig(o.preset as RigPresetName),name});
    await canWrite(o.output,o.force);if(o.poses){if(resolve(o.poses).toLowerCase()===resolve(o.output).toLowerCase())throw new Error("Rig and poses outputs must differ");await canWrite(o.poses,o.force);}
    const library=createPoseLibrary(created);
    await write(o.output,text(created),o.force);if(o.poses)await write(o.poses,text(library),o.force);
    report({ok:true,id:created.id,preset:o.preset,joints:created.joints.length,output:o.output,poses:o.poses});
  });
  rig.command("inspect").argument("<file>").option("--pose <file>").option("--offset <n>","Joint offset",number,0).option("--limit <n>","At most64 joints",number,32).action(async(file:string,o:{pose?:string;offset:number;limit:number})=>{
    if(!Number.isInteger(o.offset)||o.offset<0||!Number.isInteger(o.limit)||o.limit<1||o.limit>64)throw new Error("Use nonnegative offset and limit1..64");
    const r=parseRig(await json(file)),pose=await loadPose(r,o.pose),world=applyPose(r,pose).joints;
    report({id:r.id,canvas:r.canvas,jointsTotal:r.joints.length,shapes:r.shapes.length,layers:r.layers,proportions:r.proportions,offset:o.offset,joints:r.joints.slice(o.offset,o.offset+o.limit).map(j=>({id:j.id,parent:j.parent,local:j.position,world:world[j.id]!.position,angle:world[j.id]!.angle,length:world[j.id]!.length}))});
  });
  rig.command("validate").argument("<file>").option("--pose <file>").option("--observations <file>").option("--tolerance <pixels>","Measurement tolerance",number,.25).action(async(file:string,o:{pose?:string;observations?:string;tolerance:number})=>{
    const r=parseRig(await json(file)),pose=await loadPose(r,o.pose),diagnostics=applyPose(r,pose).diagnostics;
    if(o.observations)diagnostics.push(...validateCharacterConsistency(r,await json(o.observations),{tolerance:o.tolerance}));
    const result=summarized(diagnostics);report({...result,id:r.id,joints:r.joints.length});if(!result.ok)process.exitCode=1;
  });
  rig.command("pose").argument("<file>").option("--library <file>","Select from a poses1.0 file").option("--name <name>","Pose name","rest").option("--rotation <joint=radians>","Override absolute local joint angle",collect,[]).option("--root <x,y>","Root translation",pair).requiredOption("-o, --output <file>").option("--force").action(async(file:string,o:{library?:string;name:string;rotation:string[];root?:[number,number];output:string;force?:boolean})=>{
    const r=parseRig(await json(file));let pose=restPose(r,o.name);
    if(o.library){const {parsePoses}=await import("@pixelforge/geometry"),library=parsePoses(await json(o.library));if(library.rig!==r.id)throw new Error("Pose library refers to another rig");const selected=library.poses.find(p=>p.id===o.name);if(!selected)throw new Error(`Unknown pose ${o.name}`);pose=structuredClone(selected);}
    for(const change of o.rotation){const split=change.indexOf("=");if(split<1)throw new Error("Use --rotation joint=radians");pose.rotations[change.slice(0,split)]=number(change.slice(split+1));}
    if(o.root)pose.rootTranslation=o.root;
    const diagnostics=applyPose(r,pose).diagnostics;await write(o.output,text(poseSchema.parse(pose)),o.force,[file,...(o.library?[o.library]:[])]);report({output:o.output,...summarized(diagnostics)});
  });
  rig.command("solve-ik").argument("<file>").option("--pose <file>").requiredOption("--root <joint>").requiredOption("--middle <joint>").requiredOption("--end <joint>").requiredOption("--target <x,y>","World-space target",pair).option("--bend <direction>","+1 or -1",number,1).requiredOption("-o, --output <file>").option("--force").action(async(file:string,o:{pose?:string;root:string;middle:string;end:string;target:[number,number];bend:number;output:string;force?:boolean})=>{
    const r=parseRig(await json(file)),pose=await loadPose(r,o.pose);if(o.bend!==1&&o.bend!==-1)throw new Error("Bend must be1 or-1");
    const target={id:"cli-target",root:o.root,middle:o.middle,end:o.end,position:o.target,bend:o.bend as 1|-1};
    const result=solveRigIK(r,pose,target);result.pose.targets=[...result.pose.targets.filter(t=>t.id!==target.id),target];
    await write(o.output,text(result.pose),o.force,[file,...(o.pose?[o.pose]:[])]);report({output:o.output,...summarized(result.diagnostics),end:result.joints[o.end]!.position});
  });
  rig.command("render").argument("<file>").option("--pose <file>").option("--asset <id=file>","Referenced editable sprite",collect,[]).requiredOption("-o, --output <png>").option("--sprite <file>","Also save ordinary editable sprite JSON").option("--force").action(async(file:string,o:{pose?:string;asset:string[];output:string;sprite?:string;force?:boolean})=>{
    const r=parseRig(await json(file)),result=renderRig(r,await loadPose(r,o.pose),await resources(o.asset));await renderOutput(result.project,o,[file,...(o.pose?[o.pose]:[]),...o.asset.map(v=>v.slice(v.indexOf("=")+1))]);report({output:o.output,sprite:o.sprite,...summarized(result.diagnostics)});
  });
  rig.command("animate").argument("<file>").requiredOption("--poses <file>").requiredOption("--animation <name>").option("--existing <file>","Preserve unrelated sprite frames/animations").option("--replace", "Replace the selected rig-owned animation").requiredOption("-o, --output <sprite>").option("--force").action(async(file:string,o:{poses:string;animation:string;existing?:string;replace?:boolean;output:string;force?:boolean})=>{
    const result=generateRigAnimation(await json(file),await json(o.poses),o.animation,{existing:o.existing?fromDocument(await json(o.existing,67_108_864)):undefined,replace:o.replace});
    await write(o.output,serializeProject(result.project),o.force,[file,o.poses]);report({output:o.output,animation:o.animation,frames:result.frames.length,...summarized(result.diagnostics)});
  });
  const scene=program.command("scene").description("Project spatial objects and resolve explicit occlusion constraints");
  scene.command("create").argument("<name>").requiredOption("-o, --output <file>").option("--force").action(async(name:string,o:{output:string;force?:boolean})=>{const created=parseScene({...createInteriorScene(),name});await write(o.output,text(created),o.force);report({ok:true,output:o.output,objects:created.objects.length,requiredAssets:["scout"]});});
  scene.command("inspect").argument("<file>").option("--offset <n>","Object offset",number,0).option("--limit <n>","At most64 objects",number,32).action(async(file:string,o:{offset:number;limit:number})=>{
    if(!Number.isInteger(o.offset)||o.offset<0||!Number.isInteger(o.limit)||o.limit<1||o.limit>64)throw new Error("Use nonnegative offset and limit1..64");const s=parseScene(await json(file));report({id:s.id,canvas:s.canvas,camera:s.camera,objectsTotal:s.objects.length,objects:s.objects.slice(o.offset,o.offset+o.limit).map(o=>({id:o.id,parent:o.parent,position:o.position,size:o.size,depthGroup:o.depthGroup,parts:o.parts.map(p=>p.id),sprite:o.sprite?.asset}))});
  });
  scene.command("validate").argument("<file>").option("--asset <id=file>","Referenced editable sprite",collect,[]).action(async(file:string,o:{asset:string[]})=>{const result=summarized(validateScene(await json(file),await resources(o.asset)));report(result);if(!result.ok)process.exitCode=1;});
  scene.command("depth-order").argument("<file>").action(async(file:string)=>{const order=depthOrder(await json(file));report({ok:true,total:order.length,order:order.map(p=>({id:p.id,group:p.group,layer:p.layer,depth:p.depth}))});});
  scene.command("render").argument("<file>").option("--asset <id=file>","Referenced editable sprite",collect,[]).requiredOption("-o, --output <png>").option("--sprite <file>").option("--force").action(async(file:string,o:{asset:string[];output:string;sprite?:string;force?:boolean})=>{const result=renderScene(await json(file),await resources(o.asset));await renderOutput(result.project,o,[file,...o.asset.map(v=>v.slice(v.indexOf("=")+1))]);report({output:o.output,sprite:o.sprite,order:result.order,...summarized(result.diagnostics)});});
}
