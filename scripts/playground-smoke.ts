interface PlaygroundState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  body: { width: number; height: number; x: number; y: number };
  frames: number;
  sheet: number;
  animations: { name: string; duration: number }[];
  hits: number;
  active: string;
  entry: number;
  debug: boolean;
}
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath:
    process.env.PIXELFORGE_CHROME ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
try {
  const page = await browser.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5174");
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("Animation:"),
  );
  const inspect = () =>
    page.evaluate<PlaygroundState>(
      `(async()=>{const {game}=await import('/src/main.ts');let s;while(!(s=game.scene.getScene('playground'))?.player)await new Promise(r=>requestAnimationFrame(r));const b=s.player.body;return {x:s.player.x,y:s.player.y,vx:b.velocity.x,vy:b.velocity.y,grounded:b.blocked.down,body:{width:b.sourceWidth,height:b.sourceHeight,x:b.offset.x,y:b.offset.y},frames:s.textures.get('knight').frameTotal-1,sheet:s.textures.get('sheet-knight').frameTotal-1,animations:s.anims.get('knight:attack').frames.map(f=>({name:f.textureFrame,duration:f.duration})),hits:s.hits,active:s.current,entry:s.player.anims.currentFrame.index-1,debug:s.debugEnabled};})()`,
    );
  async function until(
    predicate: (s: Awaited<ReturnType<typeof inspect>>) => boolean,
  ) {
    for (let i = 0; i < 200; i++) {
      const s = await inspect();
      if (predicate(s)) return s;
      await page.waitForTimeout(20);
    }
    throw new Error(
      "Gameplay condition timed out: " + JSON.stringify(await inspect()),
    );
  }
  let state = await until((s) => s.grounded);
  assert.equal(state.frames, 6);
  assert.equal(state.sheet, 6);
  assert.deepEqual(state.body, { width: 11, height: 25, x: 11, y: 5 });
  const startX = state.x;
  await page.keyboard.down("D");
  await until((s) => s.x >= 200);
  await page.keyboard.up("D");
  state = await inspect();
  assert.ok(state.x > startX + 30);
  assert.equal(state.animations[1]!.duration, 220);
  const groundY = state.y;
  await page.keyboard.down("Space");
  await until((s) => s.y < groundY - 10);
  await page.keyboard.up("Space");
  await until((s) => s.grounded);
  await page.keyboard.down("D");
  await until((s) => s.x >= 250);
  await page.keyboard.up("D");
  await until((s) => s.vx === 0);
  assert.equal((await inspect()).hits, 0);
  await page.keyboard.down("J");
  await until((s) => s.active === "attack");
  await page.keyboard.up("J");
  state = await until((s) => s.hits >= 1);
  assert.equal(state.hits, 1);
  await page.keyboard.down("F3");
  await until((s) => s.debug === false);
  await page.keyboard.up("F3");
  const geometry = await page.evaluate(
    `(async()=>{const {game,applyPixelForgePhysics,getActiveHitboxes}=await import('/src/main.ts');const s=game.scene.getScene('playground'),p=s.physics.add.sprite(500,200,'knight','frame-0').setScale(2);p.body.setAllowGravity(false);const asset=structuredClone(s.asset);asset.game.origin={x:.25,y:.75};asset.game.body={type:'circle',x:4,y:6,radius:5};applyPixelForgePhysics(p,asset);p.setFlipX(true);const result={circle:p.body.isCircle,radius:p.body.radius,offset:{x:p.body.offset.x,y:p.body.offset.y},origin:{x:p.originX,y:p.originY}};p.destroy();return result;})()`,
  );
  assert.deepEqual(geometry, {
    circle: true,
    radius: 5,
    offset: { x: 4, y: 6 },
    origin: { x: 0.25, y: 0.75 },
  });
  const timing = await page.evaluate<{
    durations: number[];
    entries: number[];
  }>(
    `(async()=>{const {game}=await import('/src/main.ts');const s=game.scene.getScene('playground'),p=s.add.sprite(600,200,'knight','frame-0');return await new Promise((resolve,reject)=>{const times=[],entries=[];let last=s.time.now;const timer=setTimeout(()=>{p.destroy();reject(new Error('Timing probe timeout'));},5000);p.on('animationupdate',()=>{times.push(s.time.now-last);entries.push(p.anims.currentFrame.index-1);last=s.time.now;});p.once('animationcomplete',()=>{times.push(s.time.now-last);clearTimeout(timer);p.destroy();resolve({durations:times,entries});});p.play('knight:attack');});})()`,
  );
  assert.deepEqual(timing.entries, [1, 2]);
  for (const [i, expected] of [120, 220, 180].entries())
    assert.ok(
      Math.abs(timing.durations[i]! - expected) < 70,
      JSON.stringify(timing),
    );
  assert.deepEqual(errors, []);
  await mkdir("test-output", { recursive: true });
  await page.screenshot({ path: "test-output/playground.png", fullPage: true });
  console.log(
    "Real Phaser integration passed: generated atlas/sheet, namespaced timing, physics body, grounded movement/jump, timed attack target, debug toggle.",
  );
} finally {
  await browser.close();
}
