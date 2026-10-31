import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
export async function externalBrowser(dir){
 await writeFile(join(dir,'index.html'),'<!doctype html><html><body><div id="game"></div><script type="module" src="/main.js"></script></body></html>');
 await writeFile(join(dir,'main.js'),`
import Phaser from 'phaser';
import {bundleManifestSchema} from '@pixelforge/core';
import {loadPixelForgeAssets,readPixelForgeMetadata,registerPixelForgeAnimations,createPixelForgeCharacter,playPixelForgeAnimation} from '@pixelforge/phaser';
const response=await fetch('/enemy/bundle.json');if(!response.ok)throw new Error('Missing exported bundle');const manifest=bundleManifestSchema.parse(await response.json());
class Scene extends Phaser.Scene{
 preload(){this.load.on('loaderror',f=>{window.assetError=f.key;});loadPixelForgeAssets(this,{key:'enemy',baseURL:'/enemy',manifest});}
 create(){const data=readPixelForgeMetadata(this,'enemy'),keys=registerPixelForgeAnimations(this,{key:'enemy',manifest,...data});const sprite=createPixelForgeCharacter(this,{key:'enemy',game:data.game,x:80,y:80,layout:manifest.layout}).setScale(4);sprite.body.setAllowGravity(false);let changes=0;const times=[];let last=this.time.now;sprite.on('animationupdate',()=>{times.push(this.time.now-last);last=this.time.now;changes++;});playPixelForgeAnimation(sprite,keys,'idle');window.acceptance={sprite,changes:()=>changes,times,scene:this};}
}
new Phaser.Game({type:Phaser.CANVAS,width:160,height:160,parent:'game',pixelArt:true,banner:false,audio:{noAudio:true},physics:{default:'arcade',arcade:{gravity:{x:0,y:0}}},scene:Scene});
`);
 const server=spawn(process.execPath,[join(dir,'node_modules','vite','bin','vite.js'),'--host','127.0.0.1','--port','0'],{cwd:dir,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_OPTIONS:''}});let output='';server.stderr.on('data',d=>output+=d);
 let browser;
 try{
 const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('External Vite startup timeout: '+output)),30000);server.stdout.on('data',d=>{output+=d;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.once('exit',code=>{clearTimeout(timer);reject(new Error(`External Vite exited ${code}: ${output}`));});});
 browser=await chromium.launch({executablePath:process.env.PIXELFORGE_CHROME??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>window.acceptance?.changes()>=4);
 const actual=await page.evaluate(()=>{const a=window.acceptance,b=a.sprite.body;return {frames:a.scene.textures.get('enemy').frameTotal-1,changes:a.changes(),times:a.times,body:{width:b.sourceWidth,height:b.sourceHeight,x:b.offset.x,y:b.offset.y},assetError:window.assetError??null};});
 assert.equal(actual.frames,2);assert.ok(actual.changes>=4);assert.deepEqual(actual.body,{width:8,height:8,x:4,y:4});assert.equal(actual.assetError,null);assert.deepEqual(errors,[]);assert.ok(actual.times.some(v=>Math.abs(v-100)<60));assert.ok(actual.times.some(v=>Math.abs(v-200)<60));
 }finally{if(browser)await browser.close();server.kill();await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve);});}
}
