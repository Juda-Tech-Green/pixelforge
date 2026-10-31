import {mkdir,writeFile,readFile,cp} from 'node:fs/promises';
import sharp from 'sharp';
import * as pf from '../packages/core/src/index.js';
import {exportSpriteSheet} from '../packages/exporters/src/index.js';
const dir='examples/reference-scout';await mkdir(dir,{recursive:true});
// Original vector artwork by PixelForge contributors, distributed under the repository MIT license.
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 48 48"><path fill="#23578f" d="M15 21Q8 26 12 38L23 34 29 24Z"/><path fill="#1a1f2c" d="M18 31h6v11h-7zm8 0h5v11h-6z"/><path fill="#6f452f" d="M16 40h8v3h-9zm9 0h8v3h-8z"/><path fill="#728da3" d="M17 19Q23 16 30 20L31 33H17Z"/><path fill="#eaae75" d="M18 9Q27 6 31 12v7H19Z"/><path fill="#3f4d65" d="M17 8Q25 3 32 9v4H17Z"/><path fill="#1a1f2c" d="M29 13h2v2h-2z"/><path fill="#6f452f" d="M17 30h14v3H17Z"/><path fill="#728da3" d="M14 21h4v11h-4z"/><path fill="#eaae75" d="M14 32h4v3h-4z"/></svg>`;
await writeFile(`${dir}/reference.svg`,svg);await sharp(Buffer.from(svg)).png().toFile(`${dir}/reference.png`);
const palette:pf.Color[]=[[0,0,0,0],[26,31,44,255],[35,87,143,255],[114,141,163,255],[234,174,117,255],[63,77,101,255],[111,69,47,255]];
const project=pf.createProject({name:'Reference scout',width:48,height:48,palette});
const operations:Record<string,unknown>[]=[];
function rect(x:number,y:number,width:number,height:number,color:number){operations.push({op:'drawRect',frame:'frame-0',layer:'base',x,y,width,height,color});}
// Deliberate approximation of the known silhouette, cape, cap, facing and color masses.
rect(12,21,13,17,2);rect(18,30,6,12,1);rect(26,30,5,12,1);rect(15,40,9,3,6);rect(25,40,8,3,6);rect(17,19,14,14,3);rect(18,9,13,10,4);rect(17,8,15,5,5);rect(20,6,10,3,5);rect(29,13,2,2,1);rect(17,30,14,3,6);rect(14,21,4,11,3);rect(14,32,4,3,4);
for(let i=1;i<6;i++){operations.push({op:'copyFrame',source:'frame-0',id:`walk-${i}`});if(i%2)operations.push({op:'moveRegion',frame:`walk-${i}`,layer:'base',x:15,y:34,width:9,height:9,dx:i===1?1:-1,dy:0});}
operations.push({op:'addAnimation',name:'walk',loop:true,frames:project.frames.map(f=>({frameId:f.id,durationMs:125})).concat(Array.from({length:5},(_,i)=>({frameId:`walk-${i+1}`,durationMs:125})))},{op:'addAnimation',name:'idle',loop:true,frames:[{frameId:'frame-0',durationMs:500}]});
const batch={version:'1.0',operations},sprite=pf.applyOperations(project,batch);
await writeFile(`${dir}/base.sprite.json`,pf.serializeProject(project));await writeFile(`${dir}/construction.ops.json`,JSON.stringify(batch,null,2)+'\n');await writeFile(`${dir}/scout.sprite.json`,pf.serializeProject(sprite));
const sheet=await exportSpriteSheet(sprite,{columns:3,padding:1});await writeFile(`${dir}/contact.png`,sheet.png);
await writeFile(`${dir}/sprite-spec.json`,JSON.stringify({referencePath:'reference.png',rights:'Original PixelForge contributor artwork; MIT',canvas:{width:48,height:48},palette,facing:'right',baselineY:43,visibleFeatures:['blue cape','slate cap','warm skin','belt','dark trousers','brown boots','right-facing eye'],animations:[{name:'walk',frames:6,durationMs:125},{name:'idle',frames:1,durationMs:500}],limitations:['Block approximation of curved reference','Small leg shifts rather than full articulated gait']},null,2)+'\n');
const skill='.agents/skills/pixelforge-sprite-creator';
for(const [name,source]of [['coin','examples/coin/coin.sprite.json'],['character','examples/character/character.sprite.json'],['phaser-character','examples/phaser-playground/character.sprite.json']] as const){await mkdir(`${skill}/examples/${name}`,{recursive:true});await cp(source,`${skill}/examples/${name}/${name}.sprite.json`);}
await mkdir(`${skill}/examples/reference`,{recursive:true});for(const file of ['reference.svg','reference.png','base.sprite.json','construction.ops.json','scout.sprite.json','contact.png','sprite-spec.json'])await cp(`${dir}/${file}`,`${skill}/examples/reference/${file}`);
// A static object constructed headlessly without dense manual pixel arrays.
const icon=pf.createProject({name:'Blue gem',width:16,height:16,palette:[[0,0,0,0],[57,135,192,255],[116,198,220,255]]});pf.drawEllipse(icon,'frame-0','base',3,2,10,12,1);pf.drawLine(icon,'frame-0','base',6,4,6,9,2);await mkdir('examples/static-gem',{recursive:true});await writeFile('examples/static-gem/gem.sprite.json',pf.serializeProject(icon));await writeFile('examples/static-gem/gem.png',(await exportSpriteSheet(icon)).png);
