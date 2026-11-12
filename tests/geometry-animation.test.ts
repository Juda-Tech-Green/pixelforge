import {it,expect} from "vitest";
import {toDocument,renderFrame,fromDocument} from "@pixelforge/core";
import {createRig,createPoseLibrary,rigPresetNames,restPose,renderRig,sampleRigAnimation,generateRigAnimation,forwardKinematics,distance,validateRigSample} from "@pixelforge/geometry";
it("validates every proportion preset and generates repeatable editable palette pixels",()=>{
  for(const name of rigPresetNames){
    const rig=createRig(name),pose=restPose(rig),a=renderRig(rig,pose),b=renderRig(rig,pose);
    expect(toDocument(a.project)).toEqual(toDocument(b.project));
    const raster=renderFrame(fromDocument(toDocument(a.project)),pose.id);
    expect(raster.data.some((x,i)=>i%4===3&&x!==0)).toBe(true);
    expect(a.project.layers.map(l=>l.id)).toEqual(rig.layers);
    const colors=new Set(rig.palette.map(c=>c.join(',')));
    for(let i=0;i<raster.data.length;i+=4)expect(colors.has(Array.from(raster.data.slice(i,i+4)).join(','))).toBe(true);
  }
});
it("joint attachments move with known transforms instead of drifting independently",()=>{
  const rig=createRig(),pose=restPose(rig),before=renderRig(rig,pose);
  pose.rotations["right-elbow"]=.4;
  const after=renderRig(rig,pose);
  expect(after.joints["right-wrist"]!.position).not.toEqual(before.joints["right-wrist"]!.position);
  expect(after.project.frames[0]!.layers.get("equipment")).not.toEqual(before.project.frames[0]!.layers.get("equipment"));
  expect(distance(after.joints["right-elbow"]!.position,after.joints["right-wrist"]!.position)).toBeCloseTo(Math.hypot(1,6),10);
});
it("samples bounded stable frame IDs and sums durations exactly",()=>{
  const rig=createRig(),poses=createPoseLibrary(rig),a=generateRigAnimation(rig,poses,"walk"),b=generateRigAnimation(rig,poses,"walk");
  expect(toDocument(a.project)).toEqual(toDocument(b.project));
  expect(a.frames.map(f=>f.id)).toEqual(Array.from({length:8},(_,i)=>`walk-${String(i).padStart(3,'0')}`));
  expect(a.frames.reduce((s,f)=>s+f.durationMs,0)).toBe(800);
  for(const f of a.frames)for(const j of rig.joints)if(j.parent)expect(distance(f.joints[j.id]!.position,f.joints[j.parent]!.position)).toBeCloseTo(Math.hypot(...j.position),10);
});
it("locks a foot after pose IK and rasterizes the baked constrained pose",()=>{
  const rig=createRig(),poses=createPoseLibrary(rig),world=forwardKinematics(rig,restPose(rig));
  const target=world["left-ankle"]!.position;
  poses.animations[1]!.contacts=[{id:"left-contact",root:"left-hip",middle:"left-knee",end:"left-ankle",position:target,bend:1,start:0,endTime:1,tolerance:.25}];
  const frames=sampleRigAnimation(rig,poses,"walk");
  for(const f of frames){
    expect(f.contacts[0]!.error).toBeLessThan(.25);
    expect(renderRig(rig,f.pose).joints["left-ankle"]!.position).toEqual(f.joints["left-ankle"]!.position);
  }
});
it("changes one pose without replacing unrelated animation sources or IDs",()=>{
  const rig=createRig(),poses=createPoseLibrary(rig);
  const initial=generateRigAnimation(rig,poses,"idle").project;
  const existing=generateRigAnimation(rig,poses,"walk",{existing:initial}).project;
  const before=toDocument(existing),changed=structuredClone(poses);
  changed.poses.find(p=>p.id==="walk-a")!.rotations["left-elbow"]=.6;
  const after=toDocument(generateRigAnimation(rig,changed,"walk",{existing,replace:true}).project);
  expect(after.frames.filter(f=>f.id.startsWith("idle-"))).toEqual(before.frames.filter(f=>f.id.startsWith("idle-")));
  expect(after.animations.find(a=>a.name==="idle")).toEqual(before.animations.find(a=>a.name==="idle"));
  expect(after.frames.map(f=>f.id)).toEqual(before.frames.map(f=>f.id));
  expect(after.frames.find(f=>f.id==="walk-000")).not.toEqual(before.frames.find(f=>f.id==="walk-000"));
  expect(toDocument(existing)).toEqual(before);
});
it("detects measured bone/position drift with actionable diagnostics",()=>{
  const rig=createRig(),pose=restPose(rig),joints=forwardKinematics(rig,pose);
  const observed=Object.fromEntries(Object.entries(joints).map(([id,j])=>[id,[...j.position] as [number,number]]));
  observed["left-ankle"]![1]+=3;
  const report=validateRigSample(rig,pose,observed);
  expect(report.some(d=>d.constraint==="bone-length"&&d.joint==="left-ankle")).toBe(true);
  expect(report.every(d=>d.action&&d.tolerance===.25)).toBe(true);
});
