// Fail closed before invoking any installed compiler, checker or Prisma CLI.
import {readFile}from'node:fs/promises';import{join}from'node:path';import{createHash}from'node:crypto';
const root=process.cwd(),hash=x=>createHash('sha256').update(x).digest('hex');
const manifest=JSON.parse(await readFile(new URL('manifest.json',import.meta.url),'utf8'));
const helper=await readFile(new URL('helpers.cjs',import.meta.url));
const lock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
for(const [location,pkg]of Object.entries(lock.packages)){
 if(/\/(?:is-reference|locate-character|@prisma\/dev)$/.test(location))throw Error('Unreviewed helper/development database remains in the lockfile: '+location);
}
for(const item of manifest.packages){
 const location=join(root,'node_modules',item.name);let installed;
 try{installed=JSON.parse(await readFile(join(location,'package.json'),'utf8'));}catch(e){if(item.name==='prisma'&&e.code==='ENOENT')continue;throw e;}
 if(installed.version!==item.version){if(item.name==='svelte-check')continue;throw Error('Unexpected reviewed package version: '+item.name);}
 if(!installed.sphModified)throw Error('Unreviewed upstream package installed: '+item.name);
 for(const file of item.files){
  if(hash(await readFile(join(location,file.path)))!==file.modifiedSha256)throw Error('Reviewed source differs: '+item.name+'/'+file.path);
  if(item.name!=='prisma'&&!file.path.startsWith('src/')){
   const path=join(location,...file.path.split('/').slice(0,-1),'sph-helpers.cjs');if(hash(await readFile(path))!==hash(helper))throw Error('SPH helper differs');
  }
 }
 for(const dep of ['is-reference','locate-character','@prisma/dev'])if(installed.dependencies?.[dep])throw Error('Unreviewed dependency reintroduced: '+dep);
}
console.log('Reviewed compiler/checker/Prisma sources verified; unresolved helper and embedded database packages excluded.');
