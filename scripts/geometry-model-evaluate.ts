import {readFile,writeFile,mkdir,copyFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {z} from "zod";
import {createProject,createFrame,drawLine,drawEllipse,drawRect,renderFrame,toDocument,type Project} from "@pixelforge/core";
import {encodePNG} from "@pixelforge/exporters";
import {parseRig,parsePoses,parseScene,applyPose,renderRig,depthOrder,sceneParts,distance,rasterRound,type Vec2} from "@pixelforge/geometry";
const root="examples/geometry/model-benchmark",rig=parseRig(JSON.parse(await readFile("examples/geometry/standard/scout.rig.json","utf8"))),scene=parseScene(JSON.parse(await readFile(`${root}/unordered.scene.json`,"utf8")));
const coordinate=z.number().finite().min(-10000).max(10000),point=z.tuple([coordinate,coordinate]);
const directSchema=z.strictObject({version:z.literal("1.0"),frames:z.array(z.strictObject({id:z.string().min(1).max(64),joints:z.record(z.string().max(64),point),headWidth:z.number().finite().positive().max(64),headHeight:z.number().finite().positive().max(64)})).length(4),sceneOrder:z.array(z.string().max(128)).max(256)});
const spec=[{id:"sample-0",root:[0,0],wrist:[47,24]},{id:"sample-1",root:[1,.5],wrist:[49,26]},{id:"sample-2",root:[2,1],wrist:[48,28]},{id:"sample-3",root:[1,.5],wrist:[46,27]}];
const rest=applyPose(rig,{id:"rest"}).joints;
const hash=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
function metrics(frames:{id:string;joints:Record<string,Vec2>;headWidth:number;headHeight:number}[]){
  if(frames.length!==4||frames.some((f,i)=>f.id!==spec[i]!.id))throw new Error("Expected the exact four sample IDs in order");
  let maxBone=0,sumBone=0,bones=0,maxFoot=0,maxWrist=0,maxRoot=0,maxHead=0,maxSlide=0;
  for(let i=0;i<frames.length;i++){
    const frame=frames[i]!,request=spec[i]!;
    if(Object.keys(frame.joints).length!==rig.joints.length||rig.joints.some(j=>!Object.hasOwn(frame.joints,j.id)))throw new Error(`${frame.id}: incomplete or unknown joint IDs`);
    for(const j of rig.joints)if(j.parent){const error=Math.abs(distance(frame.joints[j.id]!,frame.joints[j.parent]!)-Math.hypot(...j.position));maxBone=Math.max(maxBone,error);sumBone+=error;bones++;}
    for(const id of ["left-ankle","right-ankle"]){maxFoot=Math.max(maxFoot,distance(frame.joints[id]!,rest[id]!.position));if(i>0)maxSlide=Math.max(maxSlide,distance(frame.joints[id]!,frames[i-1]!.joints[id]!));}
    maxWrist=Math.max(maxWrist,distance(frame.joints["right-wrist"]!,request.wrist as Vec2));
    maxRoot=Math.max(maxRoot,distance(frame.joints.pelvis!,[rest.pelvis!.position[0]+request.root[0]!,rest.pelvis!.position[1]+request.root[1]!]));
    maxHead=Math.max(maxHead,Math.abs(frame.headWidth-rig.proportions.headWidth!),Math.abs(frame.headHeight-rig.proportions.headHeight!));
  }
  const widths=frames.map(f=>f.headWidth),mean=widths.reduce((a,b)=>a+b,0)/widths.length;
  return {maxBoneLengthError:maxBone,meanBoneLengthError:sumBone/bones,maxFootTargetError:maxFoot,maxFootSlidePerStep:maxSlide,maxWristTargetError:maxWrist,maxRootTranslationError:maxRoot,maxHeadDimensionError:maxHead,headWidthVariance:widths.reduce((sum,w)=>sum+(w-mean)**2,0)/widths.length,invalidJointRelationships:0,humanVisualQuality:null};
}
function directSprite(frames:{id:string;joints:Record<string,Vec2>;headWidth:number;headHeight:number}[]):Project{
  const p=createProject({name:"Model direct drawing",width:rig.canvas.width,height:rig.canvas.height,palette:rig.palette});
  for(let i=0;i<frames.length;i++){
    const frame=frames[i]!,f=i===0?p.frames[0]!:createFrame(p,frame.id);f.id=frame.id;
    const point=(id:string)=>frame.joints[id]!.map(rasterRound) as Vec2;
    for(const j of rig.joints)if(j.parent){const a=point(j.parent),b=point(j.id);drawLine(p,f.id,"base",a[0],a[1],b[0],b[1],1);}
    const head=point("head"),chest=point("chest");drawRect(p,f.id,"base",chest[0]-7,chest[1],15,13,2);drawEllipse(p,f.id,"base",rasterRound(head[0]-frame.headWidth/2),rasterRound(head[1]-frame.headHeight/2),rasterRound(frame.headWidth),rasterRound(frame.headHeight),3);
  }return p;
}
const originalParts=sceneParts(scene),rank={background:0,midground:1,actors:2,foreground:3};
function orderMetrics(order:string[]){
  if(order.length!==originalParts.length||new Set(order).size!==order.length||originalParts.some(p=>!order.includes(p.id)))throw new Error("Scene order must contain every render part exactly once");
  const edges:[[string,string],...[string,string][]]=[["table:rear","character"],["character","table:front"],["character","table:left-leg"],["character","table:right-leg"]];
  let groupLayer=0;for(const a of originalParts)for(const b of originalParts)if((rank[a.group]<rank[b.group]||(a.group===b.group&&a.layer<b.layer))&&order.indexOf(a.id)>order.indexOf(b.id))groupLayer++;
  return {occlusionViolations:edges.filter(([a,b])=>order.indexOf(a)>order.indexOf(b)).length,groupLayerViolations:groupLayer,humanCompositionQuality:null};
}
function strippedScene(input:unknown){const parsed=parseScene(input);return {...parsed,objects:parsed.objects.map(o=>({...o,before:[],after:[],parts:o.parts.map(p=>({...p,before:[],after:[]})).sort((a,b)=>a.id.localeCompare(b.id))})).sort((a,b)=>a.id.localeCompare(b.id))};}
const argument=(name:string,fallback:string)=>{const index=process.argv.indexOf(name);return index<0?fallback:process.argv[index+1]??fallback;};
const inputRoot=argument("--input",root),outputRoot=argument("--output",root);
const manifestSchema=z.array(z.strictObject({directory:z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),model:z.string().min(1).max(128),scenePriorExampleExposure:z.boolean()})).min(1).max(32);
const manifest=manifestSchema.parse(JSON.parse(await readFile(argument("--runs",`${root}/runs.json`),"utf8")));
const runs=[];
for(const run of manifest){
  const name=run.directory,model=run.model,source=`${inputRoot}/${name}`,out=`${outputRoot}/${name}`;await mkdir(out,{recursive:true});
  const notes=await readFile(`${source}/notes.md`,"utf8");
  if(source!==out)for(const file of ["direct.json","geometry.poses.json","geometry.scene.json","notes.md"])await copyFile(`${source}/${file}`,`${out}/${file}`);
  let direct:unknown,geometry:unknown;
  try{
    const definition=directSchema.parse(JSON.parse(await readFile(`${source}/direct.json`,"utf8"))),character=metrics(definition.frames),project=directSprite(definition.frames),repeat=directSprite(definition.frames);
    const frameHashes=project.frames.map(f=>({id:f.id,hash:hash(renderFrame(project,f.id).data)}));
    const repeatable=frameHashes.every(f=>f.hash===hash(renderFrame(repeat,f.id).data));
    await writeFile(`${out}/direct.sprite.json`,JSON.stringify(toDocument(project))+"\n");await writeFile(`${out}/direct.png`,await encodePNG(renderFrame(project,project.frames[0]!.id)));
    direct={valid:true,character,scene:orderMetrics(definition.sceneOrder),repeatable,frameHashes};
  }catch(error){direct={valid:false,error:String(error)};}
  try{
    const definitions=parsePoses(JSON.parse(await readFile(`${source}/geometry.poses.json`,"utf8")));if(definitions.rig!==rig.id)throw new Error("Wrong rig reference");
    const frames=spec.map(request=>{const pose=definitions.poses.find(p=>p.id===request.id);if(!pose)throw new Error(`Missing pose ${request.id}`);const result=applyPose(rig,pose);return {id:pose.id,joints:Object.fromEntries(Object.entries(result.joints).map(([id,j])=>[id,j.position])),headWidth:rig.proportions.headWidth!,headHeight:rig.proportions.headHeight!,pose};});
    const generated=frames.map(f=>renderRig(rig,f.pose).project),character=metrics(frames),sceneDefinition=parseScene(JSON.parse(await readFile(`${source}/geometry.scene.json`,"utf8")));
    const sceneGeometryPreserved=JSON.stringify(strippedScene(sceneDefinition))===JSON.stringify(strippedScene(scene));if(!sceneGeometryPreserved)throw new Error("Scene geometry/transforms changed beyond ordering dependencies");
    const ordered=depthOrder(sceneDefinition).map(p=>p.id),frameHashes=generated.map(p=>({id:p.frames[0]!.id,hash:hash(renderFrame(p,p.frames[0]!.id).data)}));
    const repeatable=frameHashes.every((f,i)=>f.hash===hash(renderFrame(renderRig(rig,frames[i]!.pose).project,f.id).data));
    await writeFile(`${out}/geometry.sprite.json`,JSON.stringify(toDocument({...generated[0]!,frames:generated.map(p=>p.frames[0]!)}))+"\n");await writeFile(`${out}/geometry.png`,await encodePNG(renderFrame(generated[0]!,generated[0]!.frames[0]!.id)));
    geometry={valid:true,character,scene:orderMetrics(ordered),sceneGeometryPreserved,repeatable,frameHashes};
  }catch(error){geometry={valid:false,error:String(error)};}
  runs.push({requestedModel:model,direct,geometry,scenePriorExampleExposure:run.scenePriorExampleExposure,notes});
}
const result={version:"1.0",runtime:process.version,modelsExecuted:runs.length,conditionsPerModel:2,task:"task.md",frozenBeforeEvaluation:true,runs,limitations:["One specification and four poses per model; no general artistic-quality or model-superiority conclusion.","Prior example exposure is reported per run; such ordering results are not blind.","Both models may use their own mathematics in the direct condition. Scores compare actual drawing inputs, not self-reported raster annotations.","Head dimensions are explicit input dimensions; human visual/composition ratings remain null.","Model names record requested harness models, not immutable provider backend revisions."]};
await writeFile(`${outputRoot}/results.json`,JSON.stringify(result,null,2)+"\n");
await writeFile(`${outputRoot}/runs.schema.json`,JSON.stringify(z.toJSONSchema(manifestSchema),null,2)+"\n");
console.log(JSON.stringify({modelsExecuted:runs.length,results:`${outputRoot}/results.json`,runs:runs.map(r=>({requestedModel:r.requestedModel,scenePriorExampleExposure:r.scenePriorExampleExposure,direct:r.direct,geometry:r.geometry})).map(r=>({...r,direct:r.direct&&typeof r.direct==="object"&&"character" in r.direct?r.direct.character:r.direct,geometry:r.geometry&&typeof r.geometry==="object"&&"character" in r.geometry?r.geometry.character:r.geometry}))}));
