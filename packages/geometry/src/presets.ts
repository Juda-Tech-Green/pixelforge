import {parseRig,parsePoses,type Rig,type Poses,type BodyShape,type Joint} from "./rig-schema.js";
import {restPose,mirrorPose,forwardKinematics} from "./kinematics.js";
export const rigPresetNames=["standard","chibi","tall","childlike","quadruped"] as const;
export type RigPresetName=typeof rigPresetNames[number];
const palette:[[number,number,number,number],...[number,number,number,number][]]=[[0,0,0,0],[27,37,54,255],[56,135,184,255],[230,172,118,255],[125,152,164,255],[78,53,73,255],[244,196,106,255]];
export function createRig(preset:RigPresetName="standard",id=`${preset}-character`):Rig{
  if(!rigPresetNames.includes(preset))throw new Error(`Unknown rig preset ${preset}`);
  if(preset==="quadruped")return quadruped(id);
  const config={standard:{head:5,headH:6,torso:12,upper:8,lower:8,shoulder:7},chibi:{head:8,headH:8,torso:9,upper:5,lower:5,shoulder:6},tall:{head:4.5,headH:6,torso:16,upper:11,lower:11,shoulder:7},childlike:{head:6,headH:7,torso:10,upper:6.5,lower:6.5,shoulder:5.5}}[preset];
  const {head,headH,torso,upper,lower,shoulder}=config,baseline=61,pelvisY=baseline-3-upper-lower;
  const joints:unknown[]=[{id:"pelvis",parent:null,position:[32,pelvisY]},{id:"spine",parent:"pelvis",position:[0,-torso*.45]},{id:"chest",parent:"spine",position:[0,-torso*.55]},{id:"neck",parent:"chest",position:[0,-3]},{id:"head",parent:"neck",position:[0,-headH]}];
  const shapes:unknown[]=[
    {id:"cape",type:"polygon",joint:"chest",layer:"back",color:2,outline:1,points:[[-shoulder,-1],[-shoulder-3,torso+4],[shoulder,torso+2],[shoulder,0]]},
    {id:"torso",type:"polygon",joint:"chest",layer:"body",color:2,outline:1,points:[[-shoulder,-1],[shoulder,-1],[5,torso],[-5,torso]]},
    {id:"belt",type:"polygon",joint:"pelvis",layer:"body",color:5,outline:1,points:[[-5,-2],[5,-2],[5,1],[-5,1]]},
    {id:"neck-skin",type:"bone",joint:"neck",end:"head",width:4,layer:"body",color:3,outline:1},
    {id:"face",type:"ellipse",joint:"head",radius:[head,headH],layer:"head",color:3,outline:1},
    {id:"hair",type:"polygon",joint:"head",layer:"head",color:5,outline:1,points:[[-head,-headH+1],[head,-headH+1],[head,-headH*.2],[head*.3,-headH*.5],[-head,-headH*.2]]},
    {id:"eye",type:"ellipse",joint:"head",offset:[head*.45,0],radius:[.8,.8],layer:"head",color:1},
    {id:"blade",type:"polygon",joint:"right-wrist",layer:"equipment",color:4,outline:1,points:[[-1,-1],[1,-1],[1,-11],[0,-13],[-1,-11]]},
    {id:"guard",type:"polygon",joint:"right-wrist",layer:"equipment",color:6,points:[[-3,-2],[3,-2],[3,0],[-3,0]]},
  ];
  for(const [side,sign] of [["left",-1],["right",1]] as const){
    const other=side==="left"?"right":"left";
    joints.push({id:`${side}-shoulder`,parent:"chest",position:[sign*shoulder,0],mirror:`${other}-shoulder`},{id:`${side}-elbow`,parent:`${side}-shoulder`,position:[sign,7],mirror:`${other}-elbow`},{id:`${side}-wrist`,parent:`${side}-elbow`,position:[sign,6],mirror:`${other}-wrist`},{id:`${side}-hand`,parent:`${side}-wrist`,position:[0,1.5],mirror:`${other}-hand`},{id:`${side}-hip`,parent:"pelvis",position:[sign*3,1],mirror:`${other}-hip`},{id:`${side}-knee`,parent:`${side}-hip`,position:[0,upper],mirror:`${other}-knee`},{id:`${side}-ankle`,parent:`${side}-knee`,position:[0,lower],mirror:`${other}-ankle`},{id:`${side}-foot`,parent:`${side}-ankle`,position:[sign,1.5],mirror:`${other}-foot`});
    const layer=side==="left"?"limbs-back":"limbs-front";
    for(const [name,from,to,width,color] of [["upper-arm","shoulder","elbow",4,2],["forearm","elbow","wrist",3.5,3],["thigh","hip","knee",5,5],["shin","knee","ankle",4,5]] as const)shapes.push({id:`${side}-${name}`,type:"bone",joint:`${side}-${from}`,end:`${side}-${to}`,width,layer,color,outline:1});
    shapes.push({id:`${side}-hand-shape`,type:"ellipse",joint:`${side}-hand`,radius:[1.6,2],layer,color:3,outline:1},{id:`${side}-shoe`,type:"ellipse",joint:`${side}-foot`,offset:[sign,0],radius:[3,1.8],layer,color:5,outline:1});
  }
  return parseRig({version:"1.0",id,name:`${preset} scout`,canvas:{width:64,height:80},palette,layers:["back","limbs-back","body","limbs-front","head","equipment"],joints,shapes,proportions:{headWidth:head*2,headHeight:headH*2,shoulderWidth:shoulder*2,torsoLength:torso,upperLeg:upper,lowerLeg:lower}});
}
function quadruped(id:string):Rig{
  const joints:unknown[]=[{id:"body",parent:null,position:[32,35]},{id:"chest",parent:"body",position:[10,0]},{id:"hips",parent:"body",position:[-10,0]},{id:"neck",parent:"chest",position:[5,-5]},{id:"head",parent:"neck",position:[5,-3]},{id:"tail",parent:"hips",position:[-10,-5]}];
  const shapes:unknown[]=[{id:"body-shape",type:"ellipse",joint:"body",radius:[15,8],layer:"body",color:2,outline:1},{id:"head-shape",type:"ellipse",joint:"head",radius:[6,4],layer:"body",color:3,outline:1},{id:"tail-shape",type:"bone",joint:"hips",end:"tail",width:3,layer:"back",color:5,outline:1}];
  for(const [side,sign] of [["near",1],["far",-1]] as const)for(const [part,parent] of [["front","chest"],["rear","hips"]] as const){
    const root=`${side}-${part}`,layer=side==="far"?"back":"front";
    joints.push({id:root,parent,position:[sign*2,3]},{id:`${root}-knee`,parent:root,position:[part==="front"?2:-2,8]},{id:`${root}-foot`,parent:`${root}-knee`,position:[part==="front"?-2:2,8]});
    shapes.push({id:`${root}-upper`,type:"bone",joint:root,end:`${root}-knee`,width:4,layer,color:5,outline:1},{id:`${root}-lower`,type:"bone",joint:`${root}-knee`,end:`${root}-foot`,width:3,layer,color:5,outline:1});
  }
  return parseRig({version:"1.0",id,name:"quadruped prototype",canvas:{width:64,height:64},palette,layers:["back","body","front"],joints,shapes,proportions:{bodyLength:30,bodyHeight:16}});
}
export function createPoseLibrary(rig:Rig):Poses{
  const rest=restPose(rig,"idle"),walk=restPose(rig,"walk-a"),walkB=restPose(rig,"walk-b"),reach=restPose(rig,"reach"),sit=restPose(rig,"sit"),turn=restPose(rig,"turn"),breathe=restPose(rig,"breathe");
  breathe.rootTranslation=[0,.4];if(rig.joints.some(j=>j.id==="chest"))breathe.rotations.chest=.025;
  turn.facing="left";
  const has=(id:string)=>rig.joints.some(j=>j.id===id);
  if(has("left-hip")){
    walk.rotations["left-hip"]=-.3;walk.rotations["left-knee"]=.45;walk.rotations["right-hip"]=.25;walk.rotations["right-knee"]=-.35;walk.rootTranslation=[-1,.5];
    walk.rotations["left-shoulder"]=.25;walk.rotations["right-shoulder"]=-.25;
    Object.assign(walkB,mirrorPose(rig,walk,"walk-b"));
    reach.targets=[{id:"reach-hand",root:"right-shoulder",middle:"right-elbow",end:"right-wrist",position:[47,rig.joints.find(j=>j.parent===null)!.position[1]-18],bend:1}];
    sit.rootTranslation=[0,4];sit.rotations["left-hip"]=-1.2;sit.rotations["right-hip"]=-1.2;sit.rotations["left-knee"]=1.4;sit.rotations["right-knee"]=1.4;
    turn.rotations.head=-.35;turn.rotations["right-shoulder"]=-.7;turn.rotations["left-shoulder"]=.5;turn.rotations["right-hip"]=-.15;
  }
  const definitions={version:"1.0",rig:rig.id,poses:[rest,walk,walkB,reach,sit,turn,breathe],animations:[{id:"idle",loop:true,frames:4,durationMs:800,keys:[{time:0,pose:"idle"},{time:.5,pose:"breathe"},{time:1,pose:"idle"}]},{id:"walk",loop:true,frames:8,durationMs:800,keys:[{time:0,pose:"walk-a"},{time:.5,pose:"walk-b"},{time:1,pose:"walk-a"}]},{id:"reach",loop:false,frames:5,durationMs:600,keys:[{time:0,pose:"idle"},{time:1,pose:"reach"}]}]};
  const library=parsePoses(definitions);
  if(has("left-hip")){
    const world=forwardKinematics(rig,rest);
    library.animations.find(a=>a.id==="walk")!.contacts=(["left","right"] as const).map((side,i)=>({id:`${side}-plant`,root:`${side}-hip`,middle:`${side}-knee`,end:`${side}-ankle`,position:world[`${side}-ankle`]!.position,bend:i===0?1:-1,start:i*.5,endTime:i===0?.499:1,tolerance:.25}));
  }
  return parsePoses(library);
}
