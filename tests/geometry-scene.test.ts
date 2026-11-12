import {it,expect} from "vitest";
import {renderFrame,toDocument} from "@pixelforge/core";
import {parseScene,sceneTransforms,objectWorld,depthOrder,validateScene,renderScene,createInteriorScene,createRig,restPose,renderRig} from "@pixelforge/geometry";
function scene(){return parseScene({version:"1.0",id:"test",name:"Scene",canvas:{width:100,height:100},camera:{projection:"top-down"},palette:[[0,0,0,0],[255,0,0,255],[0,0,255,255]],objects:[{id:"rear",type:"box",position:[10,10,0],size:[20,20,4],geometry:{type:"box",color:1},depthGroup:"actors"},{id:"front",type:"box",position:[10,15,0],size:[20,20,4],geometry:{type:"box",color:2},depthGroup:"actors"}]});}
it("resolves nested transforms and projected geometry deterministically",()=>{
  const s=scene();s.objects[1]!.parent="rear";s.objects[0]!.rotation=Math.PI/2;
  const t=sceneTransforms(s),point=objectWorld([0,0,0],t.front!);
  expect(point[0]).toBeCloseTo(-5);expect(point[1]).toBeCloseTo(20);
  const a=renderScene(s),b=renderScene(s);expect(toDocument(a.project)).toEqual(toDocument(b.project));
});
it("uses depth as a preference and explicit dependencies as authoritative",()=>{
  const s=scene();expect(depthOrder(s).map(p=>p.id)).toEqual(["rear","front"]);
  s.objects[1]!.before=["rear"];expect(depthOrder(s).map(p=>p.id)).toEqual(["front","rear"]);
  s.objects[0]!.before=["front"];expect(()=>depthOrder(s)).toThrow(/cycle/);
  expect(validateScene(s).some(d=>d.constraint==="occlusion"&&d.severity==="error")).toBe(true);
});
it("detects missing references, parent cycles and invalid footprint geometry",()=>{
  const s=scene();s.objects[0]!.after=["missing"];expect(()=>depthOrder(s)).toThrow(/Missing/);
  expect(()=>parseScene({...s,objects:s.objects.map(o=>({...o,parent:o.id}))})).toThrow(/cycle/);
  s.objects[0]!.footprint=[[0,0],[10,0],[3,3],[10,10],[0,10]];
  expect(()=>parseScene(s)).toThrow(/convex/);
});
it("uses stable IDs for depth ties and explicit layers for side view",()=>{
  const s=scene();s.camera.projection="side-view";s.objects.reverse();
  expect(depthOrder(s).map(p=>p.id)).toEqual(["front","rear"]);
  s.objects.find(o=>o.id==="front")!.renderLayer=1;
  expect(depthOrder(s).map(p=>p.id)).toEqual(["rear","front"]);
});
it("reports only declared footprint overlaps and ground/anchor violations",()=>{
  const s=scene();expect(validateScene(s).filter(d=>d.constraint==="unexpected-overlap")).toEqual([]);
  s.constraints.noOverlap=[["rear","front"]];s.constraints.grounded=[{object:"rear",planeZ:1,tolerance:.1}];
  expect(validateScene(s).map(d=>d.constraint)).toContain("unexpected-overlap");expect(validateScene(s).map(d=>d.constraint)).toContain("ground-contact");
  s.objects[0]!.anchors.a=[0,0,0];s.objects[1]!.anchors.b=[0,0,0];s.constraints.anchors=[{object:"rear",anchor:"a",other:"front",otherAnchor:"b",tolerance:.25}];
  expect(validateScene(s).map(d=>d.constraint)).toContain("spatial-anchor");
});
it("renders split-object occlusion without editing referenced sprite pixels",()=>{
  const s=scene();s.objects=[{...s.objects[0]!,id:"table",parts:[{id:"rear",offset:[0,0,0],depthOffset:0,before:["actor"],after:[],geometry:{type:"box",color:1,outline:0}}],geometry:undefined},{...s.objects[1]!,id:"actor"}];
  s.objects[0]!.parts.push({id:"front",offset:[0,15,0],depthOffset:0,before:[],after:["actor"],geometry:{type:"box",color:1,outline:0,size:[20,5,4]}});
  expect(depthOrder(s).map(p=>p.id)).toEqual(["table:rear","actor","table:front"]);
  const p=renderScene(s).project,r=renderFrame(p,"scene-000");
  const color=(x:number,y:number)=>Array.from(r.data.slice((y*100+x)*4,(y*100+x)*4+4));
  expect(color(15,20)).toEqual([0,0,255,255]);expect(color(15,27)).toEqual([255,0,0,255]);
});
it("builds the room using a referenced rig sprite and preserves that source",()=>{
  const rig=createRig(),actor=renderRig(rig,restPose(rig,"idle")).project,before=toDocument(actor),s=createInteriorScene();
  const rendered=renderScene(s,{scout:actor});expect(rendered.order.indexOf("table:rear")).toBeLessThan(rendered.order.indexOf("character"));
  expect(rendered.order.indexOf("table:front")).toBeGreaterThan(rendered.order.indexOf("character"));
  expect(toDocument(actor)).toEqual(before);expect(rendered.diagnostics.filter(d=>d.severity==="error")).toEqual([]);
  expect(()=>renderScene(s)).toThrow(/sprite-reference/);
});
