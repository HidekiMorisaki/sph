// SPH downstream fixes. Original MIT notices remain in the installed packages
// and licenses/dependency-security-patches.txt. Never accepts unknown code.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),check=process.argv.includes('--check');
const digest=value=>createHash('sha256').update(value).digest('hex');
const manifest=JSON.parse(await readFile(new URL('licenses/security-patches.json',root),'utf8'));
for(const entry of manifest.licenses){
 if(digest(await readFile(new URL(entry.path,root)))!==entry.sha256)throw Error('Original dependency license differs: '+entry.path);
}
for(const entry of manifest.files){
 const pkg=JSON.parse(await readFile(new URL(entry.packageJson,root),'utf8'));
 if(pkg.version!==entry.version)throw Error('Review downstream security patches before updating '+pkg.name);
 const path=new URL(entry.path,root),source=await readFile(path,'utf8'),actual=digest(source);
 if(actual===entry.patchedSha256)continue;
 if(check||actual!==entry.originalSha256)throw Error('Unpatched or unknown dependency content: '+entry.path);
 let patched=source;
 for(const {before,after}of entry.replacements){
  if(patched.split(before).length!==2)throw Error('Security patch anchor differs: '+entry.path);
  patched=patched.replace(before,after);
 }
 if(digest(patched)!==entry.patchedSha256)throw Error('Security patch output differs: '+entry.path);
 await writeFile(path,patched);
}
console.log('Downstream security patches verified: safe merge properties and escaped prerender cache policy.');
