// Independent migration job; no package manager or shell required at runtime.
import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
for(const args of [['node_modules/prisma/build/index.js','migrate','deploy'],['scripts/create-admin.mjs']]){
 const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env,windowsHide:true});
 if(result.error)throw Error('Unable to start migration job');
 if(result.status!==0)process.exit(result.status??1);
}
