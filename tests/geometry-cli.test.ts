import {it,expect} from "vitest";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {promisify} from "node:util";
import {execFile} from "node:child_process";
it("CLI creates, constrains, animates and composites real editable assets safely",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"pf-geometry-cli-"));
  const run=(...args:string[])=>promisify(execFile)(process.execPath,["--conditions=development","--import",pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href,resolve("packages/cli/src/index.ts"),...args],{cwd:dir,timeout:20000});
  try{
    await run("rig","create","Scout","--output","scout.rig.json","--poses","scout.poses.json");
    const original=await readFile(join(dir,"scout.rig.json"),"utf8");
    expect(JSON.parse((await run("rig","inspect","scout.rig.json","--limit","2")).stdout).joints).toHaveLength(2);
    await run("rig","validate","scout.rig.json");
    await run("rig","pose","scout.rig.json","--library","scout.poses.json","--name","idle","--output","idle.pose.json");
    await run("rig","solve-ik","scout.rig.json","--root","right-shoulder","--middle","right-elbow","--end","right-wrist","--target","47,24","--output","reach.pose.json");
    await run("rig","render","scout.rig.json","--pose","idle.pose.json","--output","scout.png","--sprite","scout.sprite.json");
    expect((await readFile(join(dir,"scout.png"))).subarray(1,4).toString()).toBe("PNG");
    await run("rig","animate","scout.rig.json","--poses","scout.poses.json","--animation","walk","--output","walk.sprite.json");
    expect(JSON.parse(await readFile(join(dir,"walk.sprite.json"),"utf8")).frames).toHaveLength(8);
    await run("scene","create","Workshop","--output","room.scene.json");
    await run("scene","validate","room.scene.json","--asset","scout=scout.sprite.json");
    await run("scene","render","room.scene.json","--asset","scout=scout.sprite.json","--output","room.png","--sprite","room.sprite.json");
    const order=JSON.parse((await run("scene","depth-order","room.scene.json")).stdout).order.map((p:{id:string})=>p.id);
    expect(order.indexOf("table:rear")).toBeLessThan(order.indexOf("character"));expect(order.indexOf("table:front")).toBeGreaterThan(order.indexOf("character"));
    await expect(run("rig","render","scout.rig.json","--output","scout.rig.json","--force")).rejects.toThrow(/source/);
    await writeFile(join(dir,"keep.png"),"user bytes");
    await expect(run("rig","render","scout.rig.json","--output","keep.png")).rejects.toThrow(/exists/);
    expect(await readFile(join(dir,"keep.png"),"utf8")).toBe("user bytes");
    expect(await readFile(join(dir,"scout.rig.json"),"utf8")).toBe(original);
  }finally{await rm(dir,{recursive:true,force:true});}
},60000);
