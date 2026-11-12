import {mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import assert from "node:assert/strict";
import sharp from "sharp";
import {renderFrame,toDocument,type Project} from "@pixelforge/core";
import {encodePNG,exportSpriteSheet} from "@pixelforge/exporters";
import {createRig,createPoseLibrary,renderRig,generateRigAnimation,createInteriorScene,renderScene,measureRig,validateCharacterConsistency,type Rig,type Poses,type Pose} from "@pixelforge/geometry";
const root="examples/geometry";
await mkdir(root,{recursive:true});
const json=(file:string,value:unknown,compact=false)=>writeFile(file,JSON.stringify(value,null,compact?undefined:2)+"\n");
const hash=(value:Uint8Array)=>createHash("sha256").update(value).digest("hex");
const measurements:unknown[]=[];
function glyphs(text:string):string{return text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");}
async function png(project:Project,frame:string,file:string){await writeFile(file,await encodePNG(renderFrame(project,frame)));}
async function overlay(rig:Rig,pose:Pose,file:string){
  const result=renderRig(rig,pose),image=await encodePNG(renderFrame(result.project,pose.id));
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${rig.canvas.width}" height="${rig.canvas.height}">${rig.joints.filter(j=>j.parent).map(j=>{const a=result.joints[j.parent!]!.position,b=result.joints[j.id]!.position;return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#f4c46a" stroke-width=".5"/>`;}).join("")}${Object.values(result.joints).map(j=>`<circle cx="${j.position[0]}" cy="${j.position[1]}" r=".9" fill="#b0db88"/>`).join("")}</svg>`;
  await sharp(image).composite([{input:Buffer.from(svg)}]).resize(rig.canvas.width*4,rig.canvas.height*4,{kernel:"nearest"}).png().toFile(file);
}
async function animated(project:Project,name:string,file:string){
  const animation=project.animations.find(a=>a.name===name)!;
  const data=Buffer.concat(animation.frames.map(f=>Buffer.from(renderFrame(project,f.frameId).data)));
  await sharp(data,{raw:{width:project.width,height:project.height*animation.frames.length,channels:4,pageHeight:project.height}}).gif({loop:animation.loop?0:1,delay:animation.frames.map(f=>f.durationMs)}).toFile(file);
}
async function character(preset:"standard"|"chibi"|"tall"){
  const directory=`${root}/${preset}`;await mkdir(directory,{recursive:true});
  const rig=createRig(preset,`scout-${preset}`),poses=createPoseLibrary(rig),start=performance.now();
  let project=generateRigAnimation(rig,poses,"idle").project;
  project=generateRigAnimation(rig,poses,"walk",{existing:project}).project;
  project=generateRigAnimation(rig,poses,"reach",{existing:project}).project;
  for(const id of ["sit","turn"]){const pose=poses.poses.find(p=>p.id===id)!,frame=renderRig(rig,pose).project.frames[0]!;project.frames.push(frame);project.animations.push({name:id,loop:false,frames:[{frameId:id,durationMs:500}]});}
  const renderMs=performance.now()-start;
  await json(`${directory}/scout.rig.json`,rig);await json(`${directory}/scout.poses.json`,poses);await json(`${directory}/scout.sprite.json`,toDocument(project),true);
  const chosen=["idle","walk-a","reach","sit","turn"],observations=[];
  const tiles=[];
  for(let i=0;i<chosen.length;i++){
    const pose=poses.poses.find(p=>p.id===chosen[i])!,rendered=renderRig(rig,pose),metric=measureRig(rig,pose);
    await png(rendered.project,pose.id,`${directory}/${pose.id}.png`);
    observations.push({frameId:pose.id,pose,joints:metric.joints,measurements:metric.measurements,attachments:metric.attachments,bounds:metric.bounds??undefined});
    tiles.push({input:await sharp(await encodePNG(renderFrame(rendered.project,pose.id))).resize(rig.canvas.width*4,rig.canvas.height*4,{kernel:"nearest"}).toBuffer(),left:i*rig.canvas.width*4,top:24});
  }
  const labels=`<svg xmlns="http://www.w3.org/2000/svg" width="${rig.canvas.width*20}" height="24">${chosen.map((id,i)=>`<text x="${i*rig.canvas.width*4+12}" y="17" fill="#e5e9ec" font-family="Segoe UI,sans-serif" font-size="13">${glyphs(id)}</text>`).join("")}</svg>`;
  await sharp({create:{width:rig.canvas.width*20,height:rig.canvas.height*4+24,channels:4,background:"#181c20"}}).composite([{input:Buffer.from(labels),left:0,top:0},...tiles]).png().toFile(`${directory}/poses-contact.png`);
  await overlay(rig,poses.poses[0]!,`${directory}/skeleton-overlay.png`);
  await animated(project,"walk",`${directory}/walk.gif`);await animated(project,"idle",`${directory}/idle.gif`);await animated(project,"reach",`${directory}/reach.gif`);
  const diagnostics=validateCharacterConsistency(rig,observations);
  await json(`${directory}/validation.json`,{valid:!diagnostics.some(d=>d.severity==="error"),diagnostics,observations:observations.map(o=>({frameId:o.frameId,joints:o.joints,measurements:o.measurements,bounds:o.bounds}))});
  const sheet=await exportSpriteSheet(project,{columns:8});await writeFile(`${directory}/spritesheet.png`,sheet.png);
  measurements.push({preset,renderMs,frames:project.frames.length,rssBytes:process.memoryUsage().rss,spriteBytes:Buffer.byteLength(JSON.stringify(toDocument(project))),sheetBytes:sheet.png.length,diagnostics:diagnostics.length});
  return {rig,poses,project};
}
const standard=await character("standard");await character("chibi");await character("tall");
const actor=renderRig(standard.rig,standard.poses.poses.find(p=>p.id==="idle")!).project;
await json(`${root}/standard/idle.sprite.json`,toDocument(actor),true);
const scene=createInteriorScene(),sceneStart=performance.now(),room=renderScene(scene,{scout:actor});
await mkdir(`${root}/room`,{recursive:true});await json(`${root}/room/workshop.scene.json`,scene);await json(`${root}/room/workshop.sprite.json`,toDocument(room.project),true);await png(room.project,"scene-000",`${root}/room/preview.png`);await json(`${root}/room/validation.json`,{valid:!room.diagnostics.some(d=>d.severity==="error"),diagnostics:room.diagnostics,order:room.order});
measurements.push({scene:"room",renderMs:performance.now()-sceneStart,rssBytes:process.memoryUsage().rss,parts:room.order.length});
const changed=structuredClone(standard.poses);changed.poses.find(p=>p.id==="walk-a")!.rotations["left-elbow"]=.6;
const updated=generateRigAnimation(standard.rig,changed,"walk",{existing:standard.project,replace:true}).project;
const preserved=standard.project.frames.filter(f=>!f.id.startsWith("walk-")).map(f=>({frame:f.id,before:hash(renderFrame(standard.project,f.id).data),after:hash(renderFrame(updated,f.id).data)}));
assert(preserved.every(f=>f.before===f.after));assert.deepEqual(standard.project.frames.map(f=>f.id),updated.frames.map(f=>f.id));
for(const a of standard.project.animations.filter(a=>a.name!=="walk"))assert.deepEqual(updated.animations.find(b=>b.name===a.name),a);
await json(`${root}/preservation.json`,{valid:true,modifiedPose:"walk-a",unaffectedFrames:preserved,stableFrameIds:true,unaffectedAnimations:standard.project.animations.filter(a=>a.name!=="walk").map(a=>a.name),changedFrames:standard.project.frames.filter(f=>hash(renderFrame(standard.project,f.id).data)!==hash(renderFrame(updated,f.id).data)).map(f=>f.id)});
await json(`${root}/walk-edited.poses.json`,changed);await json(`${root}/walk-edited.sprite.json`,toDocument(updated),true);
if(process.argv.includes("--dataset")){
  await mkdir(`${root}/dataset`,{recursive:true});
  for(const pose of standard.poses.poses){const data=measureRig(standard.rig,pose),rendered=renderRig(standard.rig,pose);await png(rendered.project,pose.id,`${root}/dataset/${pose.id}.png`);await json(`${root}/dataset/${pose.id}.labels.json`,{version:"1.0",image:`${pose.id}.png`,rig:standard.rig.id,joints:data.joints,bones:standard.rig.joints.map(j=>({joint:j.id,parent:j.parent})),orientation:pose.facing,pose});}
}
await json(`${root}/performance.json`,{runtime:process.version,platform:process.platform,measurements});
console.log(JSON.stringify({ok:true,directory:root,characters:3,posesPerCharacter:5,sceneParts:room.order.length,preservedFrames:preserved.length,performance:measurements}));
