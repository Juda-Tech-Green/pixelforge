import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { chromium } from "playwright-core";
import sharp from "sharp";
const root = resolve("."),
  version = JSON.parse(await readFile("package.json", "utf8")).version;
for (const engineVersion of ["3.90.0", "4.2.1"])
  test(
    `independent Phaser ${engineVersion} typed adapter and WebGL runtime`,
    { timeout: 180000 },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), `pf-engine-${engineVersion}-`));
      const env = {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => !/^npm_config_allow.?scripts$/i.test(key),
          ),
        ),
        NODE_OPTIONS: "",
      };
      const run = (args) => {
        const result = spawnSync(process.execPath, args, {
          cwd: dir,
          env,
          encoding: "utf8",
          timeout: 120000,
        });
        assert.equal(result.status, 0, result.stderr || result.stdout);
        return result.stdout;
      };
      let browser, server;
      try {
        await writeFile(
          join(dir, "package.json"),
          JSON.stringify({
            name: "independent-phaser-consumer",
            private: true,
            type: "module",
          }),
        );
        assert(process.env.npm_execpath);
        run([
          process.env.npm_execpath,
          "install",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          ...(process.env.PIXELFORGE_OFFLINE === "1" ? ["--offline"] : []),
          ...["core", "exporters", "cli", "phaser", "audio-core", "audio-exporters", "geometry"].map((name) =>
            resolve("release", `pixelforge-${name}-${version}.tgz`),
          ),
          `phaser@${engineVersion}`,
          "vite@7.3.7",
          "typescript@5.9.3",
        ]);
        // Compile the actual adapter source against this consumer's engine declarations, not only an ambient stub.
        await cp("packages/phaser/src/index.ts", join(dir, "adapter-check.ts"));
        await writeFile(
          join(dir, "consumer.ts"),
          "import Phaser from 'phaser';import {loadPixelForgeAssets,createPixelForgeCharacter,getActiveAnchors} from '@pixelforge/phaser';const scene:Phaser.Scene=new Phaser.Scene('test');void scene;void loadPixelForgeAssets;void createPixelForgeCharacter;void getActiveAnchors;\n",
        );
        await writeFile(
          join(dir, "tsconfig.json"),
          JSON.stringify({
            compilerOptions: {
              module: "NodeNext",
              moduleResolution: "NodeNext",
              target: "ES2022",
              strict: true,
              skipLibCheck: true,
              noEmit: true,
              types: [],
              lib: ["ES2022", "DOM"],
            },
            include: ["consumer.ts", "adapter-check.ts"],
          }),
        );
        run([join(dir, "node_modules/typescript/bin/tsc")]);
        const cli = join(dir, "node_modules/@pixelforge/cli/dist/index.js");
        run([cli, "audio", "create", "laser", "--output", "laser.sound.json"]);
        run([cli, "audio", "export", "laser.sound.json", "--output", "public/audio"]);
        const audioManifest = JSON.parse(await readFile(join(dir, "public/audio/audio.json"), "utf8"));
        audioManifest.events = [{animation: "attack", event: "impact", sound: "laser-shot"}];
        await writeFile(join(dir, "public/audio/audio.json"), JSON.stringify(audioManifest));
        run([
          cli,
          "init",
          "actor",
          "--width",
          "16",
          "--height",
          "16",
          "--output",
          "actor.json",
        ]);
        const operations = [
          {
            op: "drawRect",
            frame: "frame-0",
            layer: "base",
            x: 4,
            y: 4,
            width: 8,
            height: 8,
            color: 1,
          },
          { op: "copyFrame", source: "frame-0", id: "second" },
          { op: "clearPixel", frame: "second", layer: "base", x: 4, y: 4 },
          {
            op: "addAnimation",
            name: "idle",
            frames: [
              { frameId: "frame-0", durationMs: 100 },
              { frameId: "second", durationMs: 200 },
            ],
            loop: true,
          },
          {
            op: "addAnimation",
            name: "attack",
            frames: [
              { frameId: "frame-0", durationMs: 100 },
              { frameId: "second", durationMs: 200 },
            ],
            loop: false,
          },
          { op: "setSpriteOrigin", origin: { x: 0.25, y: 0.75 } },
          {
            op: "setCollisionBody",
            body: { type: "rectangle", x: 4, y: 4, width: 8, height: 8 },
          },
          {
            op: "addGameBox",
            box: {
              id: "strike",
              name: "strike",
              kind: "hitbox",
              scope: { type: "project" },
              rect: { x: 2, y: 3, width: 4, height: 5 },
              enabled: true,
            },
          },
          {
            op: "addGameBox",
            box: {
              id: "hurt",
              name: "hurt",
              kind: "hurtbox",
              scope: { type: "project" },
              rect: { x: 2, y: 3, width: 4, height: 5 },
              enabled: true,
            },
          },
          {
            op: "setAnchor",
            anchor: {
              id: "weapon",
              name: "weapon",
              scope: { type: "project" },
              x: 2,
              y: 3,
            },
          },
          {
            op: "setAnimationEvent",
            event: {
              id: "impact",
              name: "impact",
              animation: "attack",
              index: 1,
            },
          },
        ];
        operations.push({
          op: "setAnimationEvent",
          event: {
            id: "idle-phase",
            name: "idle_phase",
            animation: "idle",
            index: 0,
          },
        });
        await writeFile(
          join(dir, "ops.json"),
          JSON.stringify({ version: "1.0", operations }),
        );
        run([
          cli,
          "apply",
          "actor.json",
          "--operations",
          "ops.json",
          "--output",
          "animated.json",
        ]);
        for (const layout of ["atlas", "spritesheet"])
          run([
            cli,
            "export",
            "animated.json",
            "--format",
            "phaser",
            "--layout",
            layout,
            "--output",
            `public/${layout}`,
            "--name",
            "actor",
          ]);
        await writeFile(
          join(dir, "index.html"),
          '<!doctype html><html><body style="margin:0"><button id="unlock">Enable audio</button><script type="module" src="/main.js"></script></body></html>',
        );
        await writeFile(
          join(dir, "main.js"),
          `
import Phaser from 'phaser';
import {loadPixelForgeAudio,playPixelForgeSoundEvent,loadPixelForgeAssets,readPixelForgeMetadata,registerPixelForgeAnimations,createPixelForgeCharacter,playPixelForgeAnimation,observePixelForgeEvents,getActiveHitboxes,getActiveAnchors,syncPixelForgeStaticBody} from '@pixelforge/phaser';
const manifests=await Promise.all(['atlas','spritesheet'].map(async layout=>[layout,await(await fetch('/'+layout+'/bundle.json')).json()]));
const audioManifest=await(await fetch('/audio/audio.json')).json();
class Scene extends Phaser.Scene{
 preload(){loadPixelForgeAudio(this,{baseURL:'/audio',manifest:audioManifest});this.load.on('loaderror',f=>window.assetError=f.key);for(const [layout,manifest]of manifests)loadPixelForgeAssets(this,{key:layout,baseURL:'/'+layout,manifest});}
 create(){const assets={};for(const [layout,manifest]of manifests){const data=readPixelForgeMetadata(this,layout),keys=registerPixelForgeAnimations(this,{key:layout,manifest,...data});const sprite=createPixelForgeCharacter(this,{key:layout,game:data.game,x:80,y:90,layout}).setScale(2,3).setFlipX(true);sprite.body.setAllowGravity(false);assets[layout]={data,keys,sprite};}
 const a=assets.atlas;let complete=0,impact=0;const times=[];let last=this.time.now,started=0,elapsed=0,ticks=0;this.events.on('postupdate',()=>ticks++);a.sprite.on('animationupdate',()=>{times.push(this.time.now-last);last=this.time.now;});observePixelForgeEvents(a.sprite,a.data.game,a.keys,event=>{if(event.id==='$complete'){complete++;elapsed=this.time.now-started;}if(event.name==='impact')impact++;audioEvents+=playPixelForgeSoundEvent(this,audioManifest,event);});let loopMarkers=0,loopRepeats=0;const loopSprite=assets.spritesheet.sprite;loopSprite.on('animationrepeat',()=>loopRepeats++);observePixelForgeEvents(loopSprite,assets.spritesheet.data.game,assets.spritesheet.keys,event=>{if(event.name==='idle_phase')loopMarkers++;});playPixelForgeAnimation(loopSprite,assets.spritesheet.keys,'idle');
 let audioEvents=0;const analyser=this.sound.context.createAnalyser();this.sound.masterVolumeNode.connect(analyser);document.querySelector('#unlock').onclick=async()=>{await this.sound.context.resume();};
 window.audioAcceptance=()=>({loaded:this.cache.audio.exists('laser-shot'),events:audioEvents,state:this.sound.context.state,peak:(()=>{const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);return Math.max(...samples.map(Math.abs));})()});
 let dynamicRejected=false;try{syncPixelForgeStaticBody(a.sprite,a.data.game);}catch{dynamicRejected=true;}const fixed=this.physics.add.staticSprite(140,100,'atlas','frame-0').setScale(2);syncPixelForgeStaticBody(fixed,a.data.game);fixed.setPosition(150,110);syncPixelForgeStaticBody(fixed,a.data.game);
 const circleData=structuredClone(a.data.game);circleData.game.body={type:'circle',x:2,y:2,radius:4};const circle=createPixelForgeCharacter(this,{key:'atlas',game:circleData,x:210,y:90,layout:'atlas'}).setScale(2);circle.body.setAllowGravity(false);
 window.acceptance={circle,dynamicRejected,loop:()=>({markers:loopMarkers,repeats:loopRepeats}),version:Phaser.VERSION,assets,times,ticks:()=>ticks,elapsed:()=>elapsed,start:()=>{times.length=0;last=this.time.now;started=this.time.now;playPixelForgeAnimation(a.sprite,a.keys,'attack',true);},complete:()=>complete,impact:()=>impact,scene:this,geometry:()=>({anchor:getActiveAnchors(a.sprite,a.data.game,'attack')[0].world,hit:getActiveHitboxes(a.sprite,a.data.game,'attack')[0].rect,hurt:getActiveHitboxes(a.sprite,a.data.game,'attack','hurtbox')[0].rect,origin:[a.sprite.originX,a.sprite.originY],body:{width:a.sprite.body.sourceWidth,height:a.sprite.body.sourceHeight,x:a.sprite.body.offset.x,y:a.sprite.body.offset.y},fixed:{x:fixed.body.x,y:fixed.body.y,width:fixed.body.width,height:fixed.body.height}})};
 }
}
new Phaser.Game({type:Phaser.WEBGL,width:240,height:180,pixelArt:true,banner:false,backgroundColor:'#18202a',physics:{default:'arcade',arcade:{gravity:{x:0,y:0}}},scene:Scene});
`,
        );
        server = spawn(
          process.execPath,
          [
            join(dir, "node_modules/vite/bin/vite.js"),
            "--host",
            "127.0.0.1",
            "--port",
            "0",
          ],
          { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] },
        );
        let log = "";
        server.stderr.on("data", (d) => (log += d));
        const url = await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Vite timeout " + log)),
            30000,
          );
          server.stdout.on("data", (d) => {
            log += d;
            const match = log.match(/http:\/\/127\.0\.0\.1:\d+/);
            if (match) {
              clearTimeout(timer);
              resolve(match[0]);
            }
          });
          server.once("exit", (code) => {
            clearTimeout(timer);
            reject(new Error("Vite exit " + code + " " + log));
          });
        });
        browser = await chromium.launch({
          executablePath:
            process.env.PIXELFORGE_CHROME ??
            "C:/Program Files/Google/Chrome/Application/chrome.exe",
          headless: true,
          args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        });
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(url);
        await page.waitForFunction(() => window.acceptance?.ticks() >= 10);
        await page.getByRole("button", {name: "Enable audio", exact: true}).click();
        await page.waitForFunction(() => window.audioAcceptance?.().state === "running");
        await page.evaluate(() => window.acceptance.start());
        await page.waitForFunction(() => window.audioAcceptance?.().peak > 0.001);
        assert.equal(await page.evaluate(() => window.audioAcceptance().loaded), true);
        assert.equal(await page.evaluate(() => window.audioAcceptance().events), 1);
        await page.waitForFunction(() => window.acceptance?.complete() === 1);
        const result = await page.evaluate(() => {
          const a = window.acceptance;
          return {
            circle: {
              isCircle: a.circle.body.isCircle,
              radius: a.circle.body.radius,
              x: a.circle.body.offset.x,
              y: a.circle.body.offset.y,
            },
            dynamicRejected: a.dynamicRejected,
            version: a.version,
            elapsed: a.elapsed(),
            complete: a.complete(),
            impact: a.impact(),
            times: a.times,
            geometry: a.geometry(),
            frames: ["atlas", "spritesheet"].map(
              (key) => a.scene.textures.get(key).frameTotal - 1,
            ),
            stopped: !a.assets.atlas.sprite.anims.isPlaying,
            assetError: window.assetError ?? null,
          };
        });
        console.log(
          JSON.stringify({ engine: engineVersion, observed: result }),
        );
        assert.deepEqual(result.circle, {
          isCircle: true,
          radius: 4,
          x: 2,
          y: 2,
        });
        assert.equal(result.dynamicRejected, true);
        assert.equal(result.version, engineVersion);
        assert.deepEqual(errors, []);
        assert.equal(result.assetError, null);
        assert.deepEqual(result.frames, [2, 2]);
        assert.equal(result.complete, 1);
        assert.equal(result.impact, 1);
        assert.equal(result.stopped, true);
        assert.deepEqual(result.geometry.anchor, { x: 100, y: 63 });
        assert.deepEqual(result.geometry.hit, {
          x: 92,
          y: 63,
          width: 8,
          height: 15,
        });
        assert.deepEqual(result.geometry.hurt, result.geometry.hit);
        assert.deepEqual(result.geometry.origin, [0.25, 0.75]);
        assert.deepEqual(result.geometry.body, {
          width: 8,
          height: 8,
          x: 4,
          y: 4,
        });
        assert.deepEqual(result.geometry.fixed, {
          x: 150,
          y: 94,
          width: 16,
          height: 16,
        });
        assert.ok(
          result.times.some((t) => Math.abs(t - 100) < 65),
          JSON.stringify(result),
        );
        assert.ok(Math.abs(result.elapsed - 300) < 75, JSON.stringify(result));
        const screenshot = await page.screenshot({
          clip: { x: 0, y: 0, width: 240, height: 180 },
        });
        const raster = await sharp(screenshot).ensureAlpha().raw().toBuffer();
        let white = 0;
        for (let i = 0; i < raster.length; i += 4)
          if (raster[i] > 240 && raster[i + 1] > 240 && raster[i + 2] > 240)
            white++;
        assert(white > 100, "Expected visible rendered white sprites");
        // Restart uses the same stable keys, one marker and one completion per play.
        await page.evaluate(() => {
          const a = window.acceptance;
          a.start();
        });
        await page.waitForFunction(() => window.acceptance.complete() === 2);
        assert.equal(await page.evaluate(() => window.acceptance.impact()), 2);
        const loop = await page.evaluate(() => window.acceptance.loop());
        assert.ok(loop.repeats >= 2);
        assert.equal(loop.markers, loop.repeats + 1);
        console.log(
          JSON.stringify({ engine: engineVersion, acceptance: result }),
        );
      } finally {
        if (browser) await browser.close();
        if (server) {
          server.kill();
          await new Promise((r) => {
            if (server.exitCode !== null) r();
            else server.once("exit", r);
          });
        }
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
