import {parseScene,type Scene} from "./scene-schema.js";
import {createRig} from "./presets.js";
export function createInteriorScene(id="interior-room"):Scene{
  return parseScene({version:"1.0",id,name:"Scouts' workshop",canvas:{width:320,height:180},camera:{projection:"side-view",origin:[0,165]},palette:[...createRig().palette,[105,94,91,255],[143,125,106,255],[62,72,84,255],[174,139,93,255],[64,55,60,255]],regions:[{id:"room-ground",kind:"ground",polygon:[[0,0],[319,0],[319,80],[0,80]],z:0}],objects:[
    {id:"wall",type:"structure",position:[0,20,0],size:[319,4,140],depthGroup:"background",renderLayer:1,geometry:{type:"box",color:7,outline:1}},
    {id:"floor",type:"structure",position:[0,0,-14],size:[319,80,14],depthGroup:"background",geometry:{type:"box",color:8}},
    {id:"door",type:"structure",position:[34,10,0],size:[38,4,92],depthGroup:"midground",geometry:{type:"box",color:9,outline:1},anchors:{handle:[32,0,43]}},
    {id:"handle",type:"decoration",parent:"door",position:[30,-1,42],size:[4,2,3],depthGroup:"midground",renderLayer:1,geometry:{type:"box",color:6}},
    {id:"chair",type:"furniture",position:[117,3,0],size:[27,18,39],depthGroup:"midground",geometry:{type:"box",color:10,sideColor:5,topColor:8,outline:1}},
    {id:"character",type:"character",position:[190,8,0],scale:[1.5,1.5,1.5],size:[22,12,46],depthGroup:"actors",sprite:{asset:"scout",frame:"idle",anchor:[32,61]},groundContact:[0,0,0],anchors:{foot:[0,0,0]}},
    {id:"table",type:"furniture",position:[145,0,0],size:[90,25,30],depthGroup:"actors",parts:[
      {id:"rear",before:["character"],geometry:{type:"box",size:[90,18,30],color:10,topColor:8,outline:1}},
      {id:"front",offset:[0,18,24],after:["character"],geometry:{type:"box",size:[90,7,6],color:10,outline:1}},
      {id:"left-leg",offset:[7,18,0],after:["character"],geometry:{type:"box",size:[6,7,24],color:5,outline:1}},
      {id:"right-leg",offset:[77,18,0],after:["character"],geometry:{type:"box",size:[6,7,24],color:5,outline:1}},
    ]},
    {id:"foreground-crate",type:"decoration",position:[270,-2,0],size:[35,20,23],depthGroup:"foreground",geometry:{type:"box",color:11,outline:1}},
  ],constraints:{grounded:[{object:"character",planeZ:0,tolerance:.1},{object:"table",planeZ:0,tolerance:.1}],noOverlap:[["door","table"]]}});
}
