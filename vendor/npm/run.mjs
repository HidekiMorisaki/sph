// Run one explicitly declared project task; installation never calls this file.
import{readFile}from'node:fs/promises';import{spawnSync}from'node:child_process';import{join}from'node:path';
const task=process.argv[2],pkg=JSON.parse(await readFile('package.json','utf8'));
if(!Object.hasOwn(pkg.scripts??{},task))throw Error('Unknown project task');
if(process.argv.length!==3)throw Error('Task arguments must be declared in package.json.');
const result=spawnSync(pkg.scripts[task],{shell:'/bin/sh',stdio:'inherit',env:{...process.env,PATH:join(process.cwd(),'node_modules','.bin')+':'+process.env.PATH},windowsHide:true});
if(result.error)throw result.error;process.exitCode=result.status??1;
