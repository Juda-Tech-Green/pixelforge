import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir,symlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {manageSkill} from '../.agents/skills/pixelforge-sprite-creator/scripts/install.mjs';
import {validateSkill} from '../scripts/check-skill.mjs';
test('broken skill references and unmanaged destinations fail safely',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pixelforge-broken-'));try{
 const bad=join(dir,'broken');await mkdir(bad);await writeFile(join(bad,'SKILL.md'),'---\nname: broken\ndescription: Test\n---\n[Missing](references/missing.md)');await assert.rejects(validateSkill(bad),/ENOENT/);
 const target=join(dir,'skills');await mkdir(join(target,'pixelforge-sprite-creator'),{recursive:true});await writeFile(join(target,'pixelforge-sprite-creator','keep.txt'),'keep');await assert.rejects(manageSkill('install',target,{force:true}),/receipt/);assert.equal(await readFile(join(target,'pixelforge-sprite-creator','keep.txt'),'utf8'),'keep');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('destination directory links are rejected',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pixelforge-links-'));try{const target=join(dir,'skills'),other=join(dir,'other');await mkdir(target);await mkdir(other);await symlink(other,join(target,'pixelforge-sprite-creator'),process.platform==='win32'?'junction':'dir');await assert.rejects(manageSkill('install',target,{force:true}),/symlink/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('reference fixture batch reconstructs its canonical editable project',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pixelforge-reference-'));try{const out=join(dir,'result.json');const r=spawnSync(process.execPath,['packages/cli/dist/index.js','apply','examples/reference-scout/base.sprite.json','--operations','examples/reference-scout/construction.ops.json','--output',out],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(await readFile(out,'utf8')),JSON.parse(await readFile('examples/reference-scout/scout.sprite.json','utf8')));}finally{await rm(dir,{recursive:true,force:true});}
});
test('canonical YAML metadata and every Markdown reference validate',async()=>{assert.equal((await validateSkill('.agents/skills/pixelforge-sprite-creator')).name,'pixelforge-sprite-creator');});
test('malicious receipts cannot remove files outside the installed skill',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pixelforge-traversal-'));try{const result=await manageSkill('install',dir);const sentinel=join(dir,'keep.txt');await writeFile(sentinel,'safe');await writeFile(join(result.path,'.pixelforge-install.json'),JSON.stringify({skill:'pixelforge-sprite-creator',version:1,files:{'../keep.txt':'x'}}));await assert.rejects(manageSkill('uninstall',dir,{force:true}),/Unsafe/);assert.equal(await readFile(sentinel,'utf8'),'safe');}finally{await rm(dir,{recursive:true,force:true});}
});
test('skill installation verifies receipts, protects updates and preserves unrelated files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pixelforge skill space-'));try{
 const result=await manageSkill('install',dir);assert.ok(result.files.includes('SKILL.md'));assert.equal((await manageSkill('verify',dir)).ok,true);
 await assert.rejects(manageSkill('install',dir),/already exists/);await writeFile(join(result.path,'unrelated.txt'),'keep');
 await manageSkill('install',dir,{force:true});assert.equal(await readFile(join(result.path,'unrelated.txt'),'utf8'),'keep');
 await writeFile(join(result.path,'SKILL.md'),'changed');await assert.rejects(manageSkill('verify',dir),/changed/);await assert.rejects(manageSkill('uninstall',dir),/changed/);
 await manageSkill('uninstall',dir,{force:true});assert.equal(await readFile(join(result.path,'unrelated.txt'),'utf8'),'keep');
 }finally{await rm(dir,{recursive:true,force:true});}
});
