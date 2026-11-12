import {it,expect} from "vitest";
import {parseRig,restPose,forwardKinematics,solveRigIK,applyPose,interpolatePose,mirrorPose,facePose,distance,type Rig} from "@pixelforge/geometry";
function fixture():Rig{return parseRig({version:"1.0",id:"arm",name:"Arm",canvas:{width:32,height:32},palette:[[0,0,0,0],[255,255,255,255]],layers:["body"],joints:[{id:"root",parent:null,position:[10,10]},{id:"elbow",parent:"root",position:[5,0]},{id:"hand",parent:"elbow",position:[5,0]}],shapes:[]});}
it("resolves unsorted parents, rotations and known world coordinates",()=>{
  const r=fixture();r.joints.reverse();const pose=restPose(r);pose.rotations.root=Math.PI/2;
  const w=forwardKinematics(r,pose);expect(w.hand!.position[0]).toBeCloseTo(10);expect(w.hand!.position[1]).toBeCloseTo(20);
  expect(distance(w.root!.position,w.elbow!.position)).toBeCloseTo(5);expect(distance(w.elbow!.position,w.hand!.position)).toBeCloseTo(5);
});
it("rejects cycles, missing parents, duplicate IDs, zero bones and bad attachments",()=>{
  const r=fixture();expect(()=>parseRig({...r,joints:[...r.joints,r.joints[0]]})).toThrow(/unique/);
  expect(()=>parseRig({...r,joints:r.joints.map(j=>j.id==="root"?{...j,parent:"hand"}:j)})).toThrow(/cycle/);
  expect(()=>parseRig({...r,joints:r.joints.map(j=>j.id==="hand"?{...j,parent:"missing"}:j)})).toThrow(/missing parent/);
  expect(()=>parseRig({...r,joints:r.joints.map(j=>j.id==="hand"?{...j,position:[0,0]}:j)})).toThrow(/bone length/);
  expect(()=>parseRig({...r,shapes:[{id:"head",type:"ellipse",joint:"missing",layer:"body",color:1,radius:[2,2]}]})).toThrow(/attachment/);
});
it("solves chain rotations without changing lengths and diagnoses joint limits",()=>{
  const r=fixture(),target={id:"reach",root:"root",middle:"elbow",end:"hand",position:[16,10] as [number,number],bend:1 as const};
  const solved=solveRigIK(r,restPose(r),target);expect(solved.joints.hand!.position[0]).toBeCloseTo(16);expect(solved.joints.hand!.position[1]).toBeCloseTo(10);
  expect(solved.diagnostics).toEqual([]);expect(distance(solved.joints.elbow!.position,solved.joints.hand!.position)).toBeCloseTo(5);
  r.joints[0]!.limits=[0,0];const limited=solveRigIK(r,restPose(r),target);expect(limited.diagnostics.some(d=>d.constraint==="joint-limit")).toBe(true);
  expect(limited.diagnostics.some(d=>d.constraint==="ik-target")).toBe(true);
});
it("interpolates joint space and preserves all bone lengths",()=>{
  const r=fixture(),a=restPose(r),b=restPose(r);b.rotations.root=1;b.rotations.elbow=-2;b.rootTranslation=[3,2];
  const p=interpolatePose(r,a,b,.5);expect(p.rotations.root).toBeCloseTo(.5);expect(p.rootTranslation).toEqual([1.5,1]);
  const w=applyPose(r,p).joints;expect(distance(w.root!.position,w.elbow!.position)).toBeCloseTo(5);expect(distance(w.elbow!.position,w.hand!.position)).toBeCloseTo(5);
});
it("mirrors angular poses and validates all pose references",()=>{
  const r=fixture(),p=restPose(r);p.rotations.root=.5;expect(mirrorPose(r,p).rotations.root).toBeCloseTo(-.5);
  expect(()=>forwardKinematics(r,{...p,rotations:{missing:0}})).toThrow(/unknown joint/);
  expect(()=>solveRigIK(r,p,{id:"bad",root:"hand",middle:"elbow",end:"root",position:[1,2],bend:1})).toThrow(/direct/);
});
it("reflects projected facing and solves IK in the mirrored parent basis",()=>{
  const r=fixture(),p=facePose(r,restPose(r),"left");
  const w=forwardKinematics(r,p);expect(w.root!.position).toEqual([21,10]);expect(w.hand!.position[0]).toBeCloseTo(11);
  const solved=solveRigIK(r,p,{id:"mirror-target",root:"root",middle:"elbow",end:"hand",position:[15,10],bend:-1});
  expect(solved.joints.hand!.position[0]).toBeCloseTo(15);expect(solved.joints.hand!.position[1]).toBeCloseTo(10);expect(solved.diagnostics).toEqual([]);
});
it("interpolates into a newly introduced IK target without an endpoint jump",()=>{
  const r=fixture(),a=restPose(r),b=restPose(r);
  b.targets=[{id:"target",root:"root",middle:"elbow",end:"hand",position:[16,10],bend:1}];
  const start=applyPose(r,interpolatePose(r,a,b,0)).joints.hand!.position;
  const middle=applyPose(r,interpolatePose(r,a,b,.5)).joints.hand!.position;
  expect(start[0]).toBeCloseTo(20);expect(middle[0]).toBeCloseTo(18);expect(middle[1]).toBeCloseTo(10);
});
