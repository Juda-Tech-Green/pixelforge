import {createRoot} from "react-dom/client";
import {useEffect,useRef,useState} from "react";
import {RigEditor} from "./RigEditor.js";
import {SceneEditor} from "./SceneEditor.js";
import type {Project} from "@pixelforge/core";
import "../style.css";
import "./geometry.css";
function GeometryEditor(){
  const [workspace,setWorkspace]=useState<"rig"|"scene">("rig"),[dirty,setDirty]=useState(false),unsaved=useRef({rig:false,scene:false});
  const [actor,setActor]=useState<Project|null>(null);
  function changed(kind:"rig"|"scene",value:boolean){unsaved.current[kind]=value;setDirty(unsaved.current.rig||unsaved.current.scene);}
  useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(unsaved.current.rig||unsaved.current.scene){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);},[]);
  return <div className="geometry-editor"><header><strong>PixelForge <small>Geometry</small></strong><nav aria-label="Workspaces"><a href="/" onClick={event=>{if(dirty&&!confirm("Discard unsaved geometry changes?"))event.preventDefault();else unsaved.current={rig:false,scene:false};}}>Sprite editor</a><a href="/audio.html" onClick={event=>{if(dirty&&!confirm("Discard unsaved geometry changes?"))event.preventDefault();else unsaved.current={rig:false,scene:false};}}>Audio editor</a></nav><div className="geo-workspaces" role="tablist" aria-label="Geometry workspace" onKeyDown={event=>{if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();const next=workspace==="rig"?"scene":"rig";setWorkspace(next);event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next==="rig"?0:1]?.focus();}}}><button id="rig-tab" role="tab" tabIndex={workspace==="rig"?0:-1} aria-selected={workspace==="rig"} aria-controls="rig-workspace" onClick={()=>setWorkspace("rig")}>Character rig</button><button id="scene-tab" role="tab" tabIndex={workspace==="scene"?0:-1} aria-selected={workspace==="scene"} aria-controls="scene-workspace" onClick={()=>setWorkspace("scene")}>Scene</button></div>{dirty&&<span className="geo-muted">Unsaved changes</span>}</header>
  <div id="rig-workspace" role="tabpanel" aria-labelledby="rig-tab" hidden={workspace!=="rig"}><RigEditor onDirty={value=>changed("rig",value)} onActor={project=>{setActor(project);setWorkspace("scene");}}/></div>
  <div id="scene-workspace" role="tabpanel" aria-labelledby="scene-tab" hidden={workspace!=="scene"}><SceneEditor actor={actor} onDirty={value=>changed("scene",value)}/></div></div>;
}
createRoot(document.getElementById("root")!).render(<GeometryEditor/>);
