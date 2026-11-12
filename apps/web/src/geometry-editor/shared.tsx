import {useEffect,useRef,useState,type ReactNode,type PointerEvent as ReactPointerEvent} from "react";
import type {Raster} from "@pixelforge/core";
import type {Vec2,Diagnostic} from "@pixelforge/geometry";
import type {RenderRequest,RenderReply} from "./render-worker.js";
export function saveFile(name:string,text:string|Blob):void{
  const blob=typeof text==="string"?new Blob([text],{type:"application/json"}):text,url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function readJSON(file:File):Promise<unknown>{if(file.size>2_097_152)throw new Error("Geometry definition exceeds2 MiB");return JSON.parse(await file.text()) as unknown;}
export function saveRaster(raster:Raster,name:string):void{
  const canvas=document.createElement("canvas");canvas.width=raster.width;canvas.height=raster.height;const context=canvas.getContext("2d")!;
  context.putImageData(new ImageData(Uint8ClampedArray.from(raster.data),raster.width,raster.height),0,0);canvas.toBlob(blob=>{if(blob)saveFile(name,blob);},"image/png");
}
type RequestBody=RenderRequest extends infer R?R extends RenderRequest?Omit<R,"id">:never:never;
export function useRenderedGeometry(request:RequestBody){
  const [state,setState]=useState<{raster?:Raster;error?:string;diagnostics:Diagnostic[];busy:boolean}>({diagnostics:[],busy:true});
  const worker=useRef<Worker|null>(null),serial=useRef(0),active=useRef(false),latest=useRef<RenderRequest|null>(null);
  const dispatch=()=>{if(active.current||!latest.current||!worker.current)return;active.current=true;const next=latest.current;latest.current=null;worker.current.postMessage(next);};
  useEffect(()=>{
    const instance=new Worker(new URL("./render-worker.ts",import.meta.url),{type:"module"});worker.current=instance;
    instance.onmessage=(event:MessageEvent<RenderReply>)=>{active.current=false;if(event.data.id===serial.current)setState({raster:event.data.raster,error:event.data.error,diagnostics:event.data.diagnostics??[],busy:false});dispatch();};
    instance.onerror=event=>{active.current=false;latest.current=null;setState({busy:false,error:event.message||"Geometry worker failed. Reload the workspace.",diagnostics:[]});};
    dispatch();return()=>{instance.terminate();worker.current=null;};
  },[]);
  useEffect(()=>{latest.current={...request,id:++serial.current} as RenderRequest;setState(previous=>({...previous,busy:true,error:undefined}));dispatch();},[request]);
  return state;
}
export function NumberField({label,value,change,min,max,step="any",disabled=false}:{label:string;value:number;change:(value:number)=>void;min?:number;max?:number;step?:number|"any";disabled?:boolean}){
  return <label>{label}<input type="number" value={Number(value.toFixed(5))} min={min} max={max} step={step} disabled={disabled} onChange={event=>{if(event.target.value!=="")change(event.target.valueAsNumber);}}/></label>;
}
export function Diagnostics({items,error}:{items:Diagnostic[];error?:string}){
  return <section className="geo-diagnostics" aria-label="Constraint diagnostics"><h2>Constraints</h2>{error&&<pre role="alert">{error}</pre>}{!error&&items.length===0&&<p className="geo-muted">No reported geometry violations.</p>}{items.slice(0,32).map((d,i)=><div className="geo-diagnostic" key={i}><strong>{d.severity}: {d.constraint}</strong><span>{d.joint??d.frameId}</span><p>Measured {JSON.stringify(d.actual)} · expected {JSON.stringify(d.expected)} · tolerance {d.tolerance}</p><p>{d.action}</p></div>)}{items.length>32&&<p>{items.length-32} more diagnostics. Use the CLI for the full report.</p>}</section>;
}
export function PixelBoard({raster,width,height,zoom,children,onStart,onMove}:{raster?:Raster;width:number;height:number;zoom:number;children?:ReactNode;onStart?:(point:Vec2,event:ReactPointerEvent<SVGSVGElement>)=>boolean;onMove?:(point:Vec2)=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),drag=useRef(false);
  useEffect(()=>{if(!raster||!canvas.current)return;const context=canvas.current.getContext("2d")!;context.imageSmoothingEnabled=false;context.putImageData(new ImageData(Uint8ClampedArray.from(raster.data),raster.width,raster.height),0,0);},[raster]);
  const point=(event:ReactPointerEvent<SVGSVGElement>):Vec2=>{const rect=event.currentTarget.getBoundingClientRect();return [(event.clientX-rect.left)*width/rect.width,(event.clientY-rect.top)*height/rect.height];};
  return <div className="geo-board" style={{width:width*zoom,height:height*zoom}}><canvas ref={canvas} width={width} height={height} aria-label="Generated editable pixel preview"/>
    <svg viewBox={`0 0 ${width} ${height}`} aria-label="Geometry overlay" onPointerDown={event=>{if(onStart?.(point(event),event)){drag.current=true;event.currentTarget.setPointerCapture(event.pointerId);}}} onPointerMove={event=>{if(drag.current)onMove?.(point(event));}} onPointerUp={event=>{drag.current=false;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}} onPointerCancel={()=>{drag.current=false;}}>{children}</svg>
  </div>;
}
