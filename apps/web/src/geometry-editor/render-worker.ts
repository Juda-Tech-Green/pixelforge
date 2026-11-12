import {renderFrame,type Raster} from "@pixelforge/core";
import {renderRig,renderScene,type Rig,type Pose,type Scene,type SpriteResources,type Diagnostic} from "@pixelforge/geometry";
export type RenderRequest=({kind:"rig";rig:Rig;pose:Pose}|{kind:"scene";scene:Scene;sprites:SpriteResources})&{id:number};
export interface RenderReply{id:number;raster?:Raster;error?:string;diagnostics?:Diagnostic[];}
self.onmessage=(event:MessageEvent<RenderRequest>)=>{
  const request=event.data;
  try{
    const result=request.kind==="rig"?renderRig(request.rig,request.pose):renderScene(request.scene,request.sprites);
    const raster=renderFrame(result.project,result.project.frames[0]!.id);
    self.postMessage({id:request.id,raster,diagnostics:result.diagnostics});
  }catch(error){self.postMessage({id:request.id,error:error instanceof Error?error.message:String(error)});}
};
