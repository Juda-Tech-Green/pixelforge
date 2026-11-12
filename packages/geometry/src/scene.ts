import {renderFrame,type Project} from "@pixelforge/core";
import {affine,compose,transform,inverse,finite,type Affine,type Vec2,type Vec3} from "./math.js";
import {projectPoint,unprojectPoint} from "./projection.js";
import {parseScene,type Scene,type SceneObject,type SceneGeometry} from "./scene-schema.js";
import {blankSprite,pointInPolygon,segmentDistance,type SpriteResources} from "./raster.js";
import type {Diagnostic} from "./kinematics.js";
export interface SceneTransform {ground:Affine;heightScale:number;heightOffset:number;}
export function sceneTransforms(input:unknown):Record<string,SceneTransform>{
  const scene=parseScene(input),out:Record<string,SceneTransform>=Object.create(null) as Record<string,SceneTransform>;let pending=[...scene.objects];
  for(let pass=0;pending.length&&pass<scene.objects.length;pass++){
    const next:SceneObject[]=[];
    for(const o of pending){
      if(o.parent&&!out[o.parent]){next.push(o);continue;}
      const local=affine([o.position[0],o.position[1]],o.rotation,[o.scale[0],o.scale[1]]),parent=o.parent?out[o.parent]:undefined;
      const value={ground:parent?compose(parent.ground,local):local,heightScale:(parent?.heightScale??1)*o.scale[2],heightOffset:(parent?.heightOffset??0)+(parent?.heightScale??1)*o.position[2]};
      finite(value.heightScale,value.heightOffset);out[o.id]=value;
    }
    if(next.length===pending.length)throw new Error("Scene transform hierarchy cannot be resolved");pending=next;
  }
  if(pending.length)throw new Error("Scene hierarchy work limit exceeded");return out;
}
export function objectWorld(point:Vec3,t:SceneTransform):Vec3{const xy=transform([point[0],point[1]],t.ground);const out:Vec3=[...xy,t.heightOffset+point[2]*t.heightScale];finite(...out);return out;}
export interface RenderPart {id:string;object:string;group:SceneObject["depthGroup"];layer:number;depth:number;offset:Vec3;geometry?:SceneGeometry;sprite?:SceneObject["sprite"];before:string[];after:string[];}
export function sceneParts(scene:Scene,transforms=sceneTransforms(scene)):RenderPart[]{
  const out:RenderPart[]=[];
  for(const o of scene.objects){
    const contact=objectWorld(o.groundContact,transforms[o.id]!);
    const depth=scene.camera.projection==="side-view"?0:projectPoint([contact[0],contact[1],0],scene.camera)[1];
    const parts=o.parts.length?o.parts:[{...o,id:"",offset:[0,0,0] as Vec3,depthOffset:0}];
    for(const part of parts)out.push({id:part.id?`${o.id}:${part.id}`:o.id,object:o.id,group:part.depthGroup??o.depthGroup,layer:part.renderLayer??o.renderLayer,depth:depth+o.depthOffset+part.depthOffset,offset:part.offset,geometry:part.geometry,sprite:part.sprite,before:[...o.before,...(o.parts.length?part.before:[])],after:[...o.after,...(o.parts.length?part.after:[])]});
  }
  return out;
}
const groupRank={background:0,midground:1,actors:2,foreground:3};
/** Hard layer/occlusion constraints; geometric depth is a preference among available nodes. */
export function depthOrder(input:unknown):RenderPart[]{
  const scene=parseScene(input),parts=sceneParts(scene),edges=new Map(parts.map(p=>[p.id,new Set<string>()])),indegree=new Map(parts.map(p=>[p.id,0]));
  const add=(a:string,b:string)=>{if(a===b)throw new Error(`Occlusion self-cycle ${a}`);const targets=edges.get(a)!;if(!targets.has(b)){targets.add(b);indegree.set(b,indegree.get(b)!+1);}};
  const resolve=(ref:string):RenderPart[]=>{const exact=parts.find(p=>p.id===ref);if(exact)return [exact];const found=parts.filter(p=>p.object===ref);if(!found.length)throw new Error(`Missing occlusion reference ${ref}`);return found;};
  for(const p of parts){for(const ref of p.before)for(const q of resolve(ref))add(p.id,q.id);for(const ref of p.after)for(const q of resolve(ref))add(q.id,p.id);}
  for(const a of parts)for(const b of parts)if(groupRank[a.group]<groupRank[b.group]||(a.group===b.group&&a.layer<b.layer))add(a.id,b.id);
  const compare=(a:RenderPart,b:RenderPart)=>groupRank[a.group]-groupRank[b.group]||a.layer-b.layer||a.depth-b.depth||(a.id<b.id?-1:a.id>b.id?1:0);
  const remaining=new Map(parts.map(p=>[p.id,p])),ordered:RenderPart[]=[];
  while(remaining.size){const candidates=[...remaining.values()].filter(p=>indegree.get(p.id)===0).sort(compare);if(!candidates.length)throw new Error(`Occlusion cycle or incompatible layers: ${[...remaining.keys()].sort().slice(0,16).join(", ")}`);
    const next=candidates[0]!;ordered.push(next);remaining.delete(next.id);for(const target of edges.get(next.id)!)indegree.set(target,indegree.get(target)!-1);}
  return ordered;
}
function worldFootprint(o:SceneObject,t:SceneTransform):Vec2[]{const [w,d]=o.size;return (o.footprint??[[0,0],[w,0],[w,d],[0,d]]).map(p=>transform(p as Vec2,t.ground));}
function convexOverlap(a:Vec2[],b:Vec2[]):boolean{
  for(const polygon of [a,b])for(let i=0;i<polygon.length;i++){
    const start=polygon[i]!,end=polygon[(i+1)%polygon.length]!,axis:Vec2=[end[1]-start[1],start[0]-end[0]];
    const left=a.map(p=>p[0]*axis[0]+p[1]*axis[1]),right=b.map(p=>p[0]*axis[0]+p[1]*axis[1]);
    if(Math.min(Math.max(...left),Math.max(...right))-Math.max(Math.min(...left),Math.min(...right))<=1e-9)return false;
  }return true;
}
function projectedCorners(o:SceneObject,t:SceneTransform,scene:Scene):Vec2[]{const [w,d,h]=o.size,points:Vec2[]=[];for(const x of [0,w])for(const y of [0,d])for(const z of [0,h])points.push(projectPoint(objectWorld([x,y,z],t),scene.camera));return points;}
export function sceneObjectGeometry(input:unknown,id:string){
  const scene=parseScene(input),o=scene.objects.find(o=>o.id===id);if(!o)throw new Error(`Unknown scene object ${id}`);
  const t=sceneTransforms(scene)[id]!,points=projectedCorners(o,t,scene);
  return {bounds:{min:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))] as Vec2,max:[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))] as Vec2},footprint:worldFootprint(o,t).map(p=>projectPoint([p[0],p[1],t.heightOffset],scene.camera)),contact:projectPoint(objectWorld(o.groundContact,t),scene.camera),anchors:Object.fromEntries(Object.entries(o.anchors).map(([name,p])=>[name,projectPoint(objectWorld(p,t),scene.camera)]))};
}
/** Move a ground/contact marker through the camera's defined inverse plane. */
export function moveSceneObject(input:unknown,id:string,screen:Vec2):Scene{
  const scene=parseScene(input),object=scene.objects.find(o=>o.id===id);if(!object)throw new Error(`Unknown scene object ${id}`);
  const transforms=sceneTransforms(scene),t=transforms[id]!,old=objectWorld(object.groundContact,t);
  const target=unprojectPoint(screen,scene.camera,scene.camera.projection==="side-view"?{axis:"y",value:old[1]}:{axis:"z",value:old[2]});
  const worldOrigin=objectWorld([0,0,0],t),desired:Vec3=[worldOrigin[0]+target[0]-old[0],worldOrigin[1]+target[1]-old[1],worldOrigin[2]+target[2]-old[2]];
  if(object.parent){const parent=transforms[object.parent]!,xy=transform([desired[0],desired[1]],inverse(parent.ground));object.position=[...xy,(desired[2]-parent.heightOffset)/parent.heightScale];}
  else object.position=desired;
  return parseScene(scene);
}
export function validateScene(input:unknown,sprites:SpriteResources={}):Diagnostic[]{
  const scene=parseScene(input),transforms=sceneTransforms(scene),diagnostics:Diagnostic[]=[];
  try{depthOrder(scene);}catch(error){diagnostics.push({severity:"error",constraint:"occlusion",actual:String(error),expected:"acyclic complete ordering constraints",tolerance:0,action:"Remove the reported cycle or correct missing part/object references"});}
  const byId=new Map(scene.objects.map(o=>[o.id,o]));
  for(const o of scene.objects){
    const points=projectedCorners(o,transforms[o.id]!,scene),min:Vec2=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],max:Vec2=[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
    if(min[0]<0||min[1]<0||max[0]>=scene.canvas.width||max[1]>=scene.canvas.height)diagnostics.push({severity:"warning",constraint:"scene-boundary",joint:o.id,actual:[min[0],min[1]],expected:"projected bounds inside canvas",tolerance:0,action:"Move/resize the object or adjust camera/canvas"});
    for(const p of [o,...o.parts])if(p.sprite){
      const resource=sprites[p.sprite.asset];
      if(!resource)diagnostics.push({severity:"error",constraint:"sprite-reference",joint:o.id,actual:p.sprite.asset,expected:"loaded sprite resource",tolerance:0,action:"Load the referenced editable sprite asset"});
      else if(!resource.frames.some(frame=>frame.id===p.sprite!.frame))diagnostics.push({severity:"error",constraint:"sprite-frame",joint:o.id,actual:p.sprite.frame,expected:"existing frame in the referenced resource",tolerance:0,action:"Select a valid sprite frame or load the matching editable asset"});
    }
  }
  for(const [a,b] of scene.constraints.noOverlap){if(convexOverlap(worldFootprint(byId.get(a)!,transforms[a]!),worldFootprint(byId.get(b)!,transforms[b]!)))diagnostics.push({severity:"warning",constraint:"unexpected-overlap",joint:a,actual:b,expected:"disjoint declared footprints",tolerance:0,action:"Move objects or remove the explicit noOverlap constraint if overlap is intentional"});}
  for(const c of scene.constraints.grounded){const o=byId.get(c.object)!,actual=objectWorld(o.groundContact,transforms[o.id]!)[2];if(Math.abs(actual-c.planeZ)>c.tolerance)diagnostics.push({severity:"warning",constraint:"ground-contact",joint:o.id,actual,expected:c.planeZ,tolerance:c.tolerance,action:"Place the ground anchor on its declared plane"});}
  for(const c of scene.constraints.anchors){const a=objectWorld(byId.get(c.object)!.anchors[c.anchor]!,transforms[c.object]!),b=objectWorld(byId.get(c.other)!.anchors[c.otherAnchor]!,transforms[c.other]!),error=Math.hypot(...a.map((v,i)=>v-b[i]!));if(error>c.tolerance)diagnostics.push({severity:"warning",constraint:"spatial-anchor",joint:c.object,actual:error,expected:0,tolerance:c.tolerance,action:"Align the two declared anchors or update the relationship"});}
  return diagnostics;
}
function fillPolygon(data:Uint8Array,width:number,height:number,points:Vec2[],color:number,outline:number):void{
  const minX=Math.max(0,Math.floor(Math.min(...points.map(p=>p[0])))),maxX=Math.min(width-1,Math.ceil(Math.max(...points.map(p=>p[0])))),minY=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1])))),maxY=Math.min(height-1,Math.ceil(Math.max(...points.map(p=>p[1]))));
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const point:Vec2=[x,y],edge=Math.min(...points.map((p,i)=>segmentDistance(point,p,points[(i+1)%points.length]!)));
    if(pointInPolygon(point,points)||edge<1e-8)data[y*width+x]=outline&&edge<1?outline:color;
  }
}
export function renderScene(input:unknown,sprites:SpriteResources={}):{project:Project;order:string[];diagnostics:Diagnostic[]}{
  const scene=parseScene(input),transforms=sceneTransforms(scene),parts=depthOrder(scene),diagnostics=validateScene(scene,sprites);
  const fatal=diagnostics.find(d=>d.severity==="error");if(fatal)throw new Error(`${fatal.constraint}: ${fatal.actual}`);
  const layers=parts.length?parts.map(p=>p.id):["scene"],project=blankSprite(scene.name,scene.canvas.width,scene.canvas.height,scene.palette,layers,"scene-000");
  const byId=new Map(scene.objects.map(o=>[o.id,o]));
  for(const part of parts){
    const object=byId.get(part.object)!,t=transforms[part.object]!,data=project.frames[0]!.layers.get(part.id)!;
    const screen=(v:Vec3)=>projectPoint(objectWorld([v[0]+part.offset[0],v[1]+part.offset[1],v[2]+part.offset[2]],t),scene.camera);
    const g=part.geometry;
    if(g?.type==="polygon")fillPolygon(data,project.width,project.height,g.points.map(screen),g.color,g.outline);
    if(g?.type==="box"){
      const [w,d,h]=g.size??object.size,origin=screen([0,0,0]);
      const axis=([screen([1,0,0]),screen([0,1,0]),screen([0,0,1])] as Vec2[]).map(p=>[p[0]-origin[0],p[1]-origin[1]] as Vec2);
      const cross=(a:Vec2,b:Vec2)=>a[0]*b[1]-a[1]*b[0],view=[cross(axis[1]!,axis[2]!),cross(axis[2]!,axis[0]!),cross(axis[0]!,axis[1]!)];
      const faces:{points:Vec3[];color:number}[]=[];
      if(Math.abs(view[0]!)>1e-9){const x=view[0]!>0?w:0;faces.push({points:[[x,0,0],[x,d,0],[x,d,h],[x,0,h]],color:g.sideColor??g.color});}
      if(Math.abs(view[1]!)>1e-9){const y=view[1]!>0?d:0;faces.push({points:[[0,y,0],[w,y,0],[w,y,h],[0,y,h]],color:g.color});}
      if(Math.abs(view[2]!)>1e-9){const z=view[2]!>0?h:0;faces.push({points:[[0,0,z],[w,0,z],[w,d,z],[0,d,z]],color:g.topColor??g.color});}
      for(const f of faces)fillPolygon(data,project.width,project.height,f.points.map(screen),f.color,g.outline);
    }
    if(part.sprite){
      const source=sprites[part.sprite.asset]!,raster=renderFrame(source,part.sprite.frame),anchor=screen(object.groundContact);
      // Sprite references are camera-facing billboards. Ground/world geometry
      // handles depth; pixels retain nearest-neighbor sampling and palette.
      const scaleX=scene.camera.scale*Math.hypot(t.ground[0],t.ground[1]),scaleY=scene.camera.scale*(scene.camera.projection==="top-down"?Math.hypot(t.ground[2],t.ground[3]):t.heightScale);
      for(let y=0;y<project.height;y++)for(let x=0;x<project.width;x++){
        const sx=Math.floor((x-anchor[0])/scaleX+part.sprite.anchor[0]+.5),sy=Math.floor((y-anchor[1])/scaleY+part.sprite.anchor[1]+.5);
        if(sx<0||sy<0||sx>=raster.width||sy>=raster.height)continue;
        const offset=(sy*raster.width+sx)*4;if(raster.data[offset+3]===0)continue;
        const index=scene.palette.findIndex(c=>c.every((value,i)=>value===raster.data[offset+i]));if(index<0)throw new Error(`${part.id}: referenced sprite color absent from scene palette`);data[y*project.width+x]=index;
      }
    }
  }
  project.metadata={pixelforgeGeometry:{version:"1.0",scene:scene.id,order:parts.map(p=>p.id)}};
  return {project,order:parts.map(p=>p.id),diagnostics};
}
