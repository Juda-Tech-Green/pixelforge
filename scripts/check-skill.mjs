import {readFile,readdir,access} from 'node:fs/promises';
import {resolve,dirname,basename,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'yaml';
export async function validateSkill(root){
 root=resolve(root);const text=await readFile(resolve(root,'SKILL.md'),'utf8'),front=text.match(/^---\r?\n([\s\S]*?)\r?\n---/);if(!front)throw new Error('Missing YAML frontmatter');const meta=parse(front[1],{uniqueKeys:true});
 if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.name??'')||meta.name.length>64||meta.name!==basename(root))throw new Error('Invalid skill name');if(typeof meta.description!=='string'||!meta.description.trim()||meta.description.length>1024)throw new Error('Invalid skill description');
 const walk=async dir=>{for(const e of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,e.name);if(e.isDirectory())await walk(path);else if(e.name.endsWith('.md')){const md=await readFile(path,'utf8');for(const m of md.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){const href=m[1];if(/^(https?:|#)/.test(href))continue;const target=resolve(dirname(path),href),rel=relative(root,target);if(rel.startsWith('..')||isAbsolute(rel))throw new Error(`Reference escapes skill: ${href}`);await access(target);}}}};await walk(root);return {ok:true,name:meta.name,description:meta.description};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{console.log(JSON.stringify(await validateSkill(process.argv[2]??'.agents/skills/pixelforge-sprite-creator')));}catch(e){console.error(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;}}
