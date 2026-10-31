import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,'release');await mkdir(out,{recursive:true});
// Invoke npm's JavaScript entry point without shell command interpolation on Windows.
const npm=process.env.npm_execpath;if(!npm)throw new Error('Run through npm run pack:release');
for(const name of ['core','exporters','cli','phaser']){
 const dir=resolve(root,'packages',name),file=resolve(dir,'package.json'),original=await readFile(file,'utf8'),packed=JSON.parse(original);
 if(packed.exports)delete packed.exports.development;
 let status;try{await writeFile(file,JSON.stringify(packed,null,2)+'\n');const result=spawnSync(process.execPath,[npm,'pack','--ignore-scripts','--pack-destination',out],{cwd:dir,stdio:'inherit'});status=result.status??1;}finally{await writeFile(file,original);}
 if(status!==0)process.exit(status);
}
