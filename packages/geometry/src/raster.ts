import { createProject, renderFrame, type Project } from "@pixelforge/core";
import { affine, compose, distance, inverse, transform, type Affine, type Vec2 } from "./math.js";
import { applyPose, type Diagnostic, type WorldJoint } from "./kinematics.js";
import { parseRig, poseSchema, type BodyShape, type Rig } from "./rig-schema.js";
export type SpriteResources=Record<string,Project>;
export function pointInPolygon(point:Vec2,vertices:Vec2[]):boolean{
  let inside=false;
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
    const a=vertices[i]!,b=vertices[j]!;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function segmentDistance(p:Vec2,a:Vec2,b:Vec2):number{
  const dx=b[0]-a[0],dy=b[1]-a[1],s=dx*dx+dy*dy;
  const t=s===0?0:Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/s));
  return distance(p,[a[0]+dx*t,a[1]+dy*t]);
}
export function blankSprite(name:string,width:number,height:number,palette:Rig["palette"],layers:string[],frameId:string):Project{
  const p=createProject({name,width,height,palette});p.layers=layers.map(id=>({id,name:id,visible:true}));
  p.frames=[{id:frameId,layers:new Map(layers.map(id=>[id,new Uint8Array(width*height)]))}];return p;
}
function paintShape(p:Project,shape:BodyShape,joints:Record<string,WorldJoint>,sprites:SpriteResources):void{
  const data=p.frames[0]!.layers.get(shape.layer)!;
  const matrix=compose(joints[shape.joint]!.matrix,affine(shape.offset,shape.rotation));
  const inv=inverse(matrix);
  let sample:(point:Vec2)=>number;
  if(shape.type==="ellipse"){
    sample=point=>{
      const local=transform(point,inv),[rx,ry]=shape.radius;
      if((local[0]/rx)**2+(local[1]/ry)**2>1)return 0;
      const innerX=rx-1,innerY=ry-1;
      return shape.outline&&(innerX<=0||innerY<=0||(local[0]/innerX)**2+(local[1]/innerY)**2>1)?shape.outline:shape.color;
    };
  }else if(shape.type==="bone"){
    const a=transform([0,0],matrix),b=joints[shape.end]!.position;
    sample=point=>{const d=segmentDistance(point,a,b);return d>shape.width/2?0:shape.outline&&d>shape.width/2-1?shape.outline:shape.color;};
  }else if(shape.type==="polygon"){
    const points=shape.points.map(point=>transform(point,matrix));
    sample=point=>{
      const edge=Math.min(...points.map((a,i)=>segmentDistance(point,a,points[(i+1)%points.length]!)));
      if(!pointInPolygon(point,points)&&edge>1e-9)return 0;
      return shape.outline&&edge<1?shape.outline:shape.color;
    };
  }else{
    const resource=sprites[shape.asset];if(!resource)throw new Error(`${shape.id}: missing sprite resource ${shape.asset}`);
    const raster=renderFrame(resource,shape.frame);
    // Resolve the composited RGBA to canonical palette indices; source layers
    // remain referenced, never copied into the rig document.
    sample=point=>{
      const local=transform(point,inv),x=Math.floor(local[0]/shape.scale+.5),y=Math.floor(local[1]/shape.scale+.5);
      if(x<0||y<0||x>=raster.width||y>=raster.height)return 0;
      const offset=(y*raster.width+x)*4;if(raster.data[offset+3]===0)return 0;
      const index=p.palette.findIndex(c=>c.every((v,k)=>v===raster.data[offset+k]));
      if(index<0)throw new Error(`${shape.id}: composited attachment color is absent from rig palette`);return index;
    };
  }
  for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){const color=sample([x,y]);if(color!==0)data[y*p.width+x]=color;}
}
export function renderRig(input:unknown,poseInput:unknown,sprites:SpriteResources={}):{project:Project;joints:Record<string,WorldJoint>;diagnostics:Diagnostic[]}{
  const rig=parseRig(input),requested=poseSchema.parse(poseInput),solved=applyPose(rig,requested);
  const project=blankSprite(rig.name,rig.canvas.width,rig.canvas.height,rig.palette,rig.layers,requested.id);
  for(const layer of rig.layers)for(const shape of rig.shapes)if(shape.layer===layer)paintShape(project,shape,solved.joints,sprites);
  project.metadata={pixelforgeGeometry:{version:"1.0",rig:rig.id,pose:requested.id}};
  return {project,joints:solved.joints,diagnostics:solved.diagnostics};
}
export function transformPolygon(points:Vec2[],matrix:Affine):Vec2[]{return points.map(p=>transform(p,matrix));}
