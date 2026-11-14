// Fetch pinned archives as data; sanitize before any npm install or lifecycle execution.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';import{filesFromTar}from'./archive.mjs';
const root=new URL('./',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const helper=await readFile(new URL('helpers.cjs',root));
const sphLicense=await readFile(new URL('../../LICENSE',root));

const output=new URL('generated/',root);await mkdir(output,{recursive:true});
for(const item of manifest.packages){
 const response=await fetch(item.source);if(!response.ok)throw Error('Archive fetch failed '+item.name);
 const bytes=Buffer.from(await response.arrayBuffer()),[algorithm,expected]=item.integrity.split('-');
 if(createHash(algorithm).update(bytes).digest('base64')!==expected)throw Error('Archive integrity differs '+item.name);
 const files=new Map([...filesFromTar(bytes)].map(([path,file])=>[path,file.data]));
 for(const patch of item.files){
  const original=files.get(patch.path)?.toString();if(hash(original??'')!==patch.originalSha256)throw Error('Unreviewed source '+item.directory+'/'+patch.path);
  let modified=original;
  for(const edit of [...patch.edits].sort((a,b)=>b.start-a.start)){
   if(hash(original.slice(edit.start,edit.end))!==edit.sha256)throw Error('Replacement boundary differs');
   modified=modified.slice(0,edit.start)+edit.after+modified.slice(edit.end);
  }
  modified='// SPH modified 2026-11-01; see SPH-MODIFICATIONS.md.\n'+modified;
  if(hash(modified)!==patch.modifiedSha256)throw Error('Modified source differs');files.set(patch.path,Buffer.from(modified));
  if(item.name!=='prisma'&&!patch.path.startsWith('src/'))files.set(patch.path.split('/').slice(0,-1).join('/')+'/sph-helpers.cjs',helper);
 }
 files.set('LICENSE-SPH',sphLicense);
 for(const [name,expected] of Object.entries(item.originalFiles??{}))if(hash(files.get(name)??'')!==expected)throw Error('Unreviewed original '+item.name+'/'+name);
 const pkg=JSON.parse(files.get('package.json'));delete pkg.devDependencies;delete pkg.scripts;
 for(const name of item.removedDependencies??[])delete pkg.dependencies?.[name];
 if(item.name==='@rollup/plugin-commonjs')delete pkg.dependencies['is-reference'];
 if(item.name==='prisma')delete pkg.dependencies['@prisma/dev'];
 if(item.name==='svelte'){
  delete pkg.dependencies['is-reference']; delete pkg.dependencies['locate-character'];
  files.set('sph-helpers.cjs',helper);
  files.set('sph-reference.js',Buffer.from("import helpers from './sph-helpers.cjs';export default (node,parent)=>helpers.reference(node,parent,true);\n"));
  files.set('sph-location.js',Buffer.from("import helpers from './sph-helpers.cjs';export const {getLocator,locate}=helpers;\n"));
  files.set('sph-location.d.ts',Buffer.from('export interface Location {line:number;column:number;character:number}\nexport function getLocator(source:string,options?:{offsetLine?:number;offsetColumn?:number}):(search:string|number,index?:number)=>Location|undefined;\n'));
  pkg.files.push('sph-*');
 }
 if(Array.isArray(pkg.files))pkg.files.push('LICENSE-SPH','SPH-MODIFICATIONS.md');
 pkg.sphModified=(item.modifiedAt??'2026-11-01')+': see SPH-MODIFICATIONS.md';files.set('package.json',Buffer.from(JSON.stringify(pkg,null,2)+'\n'));
 files.set('SPH-MODIFICATIONS.md',Buffer.from(`SPH modified ${item.name} ${item.version}, ${item.modifiedAt??'2026-11-01'}.\nPinned original: ${item.source}\nIntegrity: ${item.integrity}\n\n${item.modifications??'Replaced bundled reference/position helpers with SPH implementations, or excluded\nthe Prisma embedded development database. Removed stale source maps and lifecycle\nscripts.'} Original retained component licenses and copyrights remain applicable.\nSee product/vendor/npm/manifest.json for exact source and output digests.\n`));
 const destination=new URL(item.directory+'/',output);await mkdir(destination,{recursive:true});
 for(const [name,data]of files){if(name.endsWith('.map'))continue;const target=new URL(name,destination);if(!target.href.startsWith(destination.href))throw Error('Path outside vendor package');await mkdir(new URL('./',target),{recursive:true});await writeFile(target,data);}
 console.log('Prepared reviewed package: '+item.directory);
}
