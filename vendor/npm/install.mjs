// Docker-only installer for the reviewed lockfile. No resolver, updates, scripts,
// registry metadata, user config, credentials, or global package manager.
import{readFile,writeFile,mkdir,chmod,cp,symlink,stat}from'node:fs/promises';
import{resolve,join,dirname,relative,sep}from'node:path';import{createHash}from'node:crypto';import{filesFromTar}from'./archive.mjs';
if(process.platform!=='linux')throw Error('The fixed-lock Docker installer supports Linux only. Use reviewed npm ci for local development.');
const root=process.cwd(),lock=JSON.parse(await readFile('package-lock.json','utf8'));
let existing=false;try{await stat(join(root,'node_modules'));existing=true;}catch(error){if(error.code!=='ENOENT')throw error;}
if(existing)throw Error('The fixed-lock installer requires a fresh node_modules directory.');
if(lock.lockfileVersion!==3)throw Error('Review the installer before changing the lockfile format.');
const omitDev=process.argv.includes('--omit=dev'),omitOptional=process.argv.includes('--omit=optional');
const libc=process.report.getReport().header.glibcVersionRuntime?'glibc':'musl';
const matches=(allowed,value)=>!allowed||(!allowed.includes('!'+value)&&(allowed.includes(value)||allowed.every(x=>x.startsWith('!'))));
const entries=Object.entries(lock.packages).filter(([path,pkg])=>path&&!(omitDev&&pkg.dev)&&!(omitOptional&&pkg.optional)&&!(omitDev&&omitOptional&&pkg.devOptional)&&matches(pkg.os,process.platform)&&matches(pkg.cpu,process.arch)&&matches(pkg.libc,libc));
const installed=[];
function inside(parent,path){const result=resolve(parent,path);if(result!==parent&&!result.startsWith(parent+sep))throw Error('Dependency path escapes its package');return result;}
async function install([path,pkg]){
 if(!path.startsWith('node_modules/')||path.split('/').includes('..')||pkg.link)throw Error('Unsupported locked package path');
 const folder=inside(root,path);await mkdir(dirname(folder),{recursive:true});
 if(pkg.resolved?.startsWith('file:../vendor/npm/generated/')){
  const name=pkg.resolved.slice('file:../vendor/npm/generated/'.length);if(!/^[a-z0-9.-]+$/.test(name))throw Error('Unexpected local package name');
  await cp(new URL('generated/'+name+'/',import.meta.url),folder,{recursive:true,errorOnExist:true,force:false});
 }else{
  const url=new URL(pkg.resolved);if(url.protocol!=='https:'||url.hostname!=='registry.npmjs.org'||url.username||url.password||url.search||url.hash)throw Error('Unreviewed archive origin');
  if(!/^sha512-[A-Za-z0-9+/=]+$/.test(pkg.integrity??''))throw Error('A SHA-512 integrity is required');
  const response=await fetch(url);if(!response.ok)throw Error('Locked archive fetch failed: '+path);
  const bytes=Buffer.from(await response.arrayBuffer());if('sha512-'+createHash('sha512').update(bytes).digest('base64')!==pkg.integrity)throw Error('Locked archive integrity differs: '+path);
  for(const [name,file]of filesFromTar(bytes)){
   const target=inside(folder,name);await mkdir(dirname(target),{recursive:true});await writeFile(target,file.data);await chmod(target,file.mode&0o111?0o755:0o644);
  }
 }
 const actual=JSON.parse(await readFile(join(folder,'package.json'),'utf8'));if(actual.version!==pkg.version)throw Error('Locked package version differs: '+path);
 installed.push({path,folder,pkg:actual});
}
// Four independent HTTPS downloads at a time, without invoking package code.
const depths=[...new Set(entries.map(([path])=>path.split('node_modules/').length))].sort((a,b)=>a-b);
for(const depth of depths){
 const group=entries.filter(([path])=>path.split('node_modules/').length===depth);
 for(let start=0;start<group.length;start+=4)await Promise.all(group.slice(start,start+4).map(install));
}
const bins=join(root,'node_modules','.bin');await mkdir(bins,{recursive:true});
for(const {path,folder,pkg}of installed.sort((a,b)=>a.path.localeCompare(b.path))){
 const entries=typeof pkg.bin==='string'?[[pkg.name.split('/').at(-1),pkg.bin]]:Object.entries(pkg.bin??{});
 // Nested module executables belong in that module parent's .bin directory.
 const marker=path.lastIndexOf('node_modules/'),binRoot=join(root,path.slice(0,marker),'node_modules','.bin');await mkdir(binRoot,{recursive:true});
 for(const [name,target]of entries){if(!/^[A-Za-z0-9_.-]+$/.test(name))throw Error('Unsafe executable name');const executable=inside(folder,target);await chmod(executable,0o755);await symlink(relative(binRoot,executable),join(binRoot,name));}
}
console.log('Installed '+installed.length+' exact locked packages without npm, dependency resolution, or lifecycle scripts.');
