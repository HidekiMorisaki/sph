import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const vendor = new URL('vendor/jspdf/', root);
const manifest = JSON.parse(await readFile(new URL('source-manifest.json', vendor), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const fflateNotice=JSON.parse(await readFile(new URL('licenses/fflate-0.8.3.json',root),'utf8'));
for(const entry of fflateNotice.embeddedSources){
 for(const folder of ['licenses/','static/licenses/'])if(hash(await readFile(new URL(folder+entry.file,root)))!==entry.licenseSha256)throw Error('fflate embedded original notice differs: '+entry.name);
}
for (const entry of manifest.files) {
 if (hash(await readFile(new URL(entry.path, vendor))) !== entry.sha256) throw Error('PDF source differs from reviewed manifest: ' + entry.path);
}
const notice = await readFile(new URL('static/licenses/jspdf-SPH-NOTICES.txt', root));
if (hash(notice) !== manifest.noticeSha256) throw Error('PDF distribution notices changed without review.');
const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
if(lock.packages['node_modules/marked']?.version!=='18.1.2')throw Error('Review the Markdown parser version before changing it.');
for(const path of ['node_modules/marked/LICENSE','licenses/marked-18.1.2.txt','static/licenses/marked-18.1.2.txt'])if(hash(await readFile(new URL(path,root)))!=='8e3a3f82f59a60958f56ca08f445647c32a4733dc7ca6c2c46f6eb898471ab9c')throw Error('Marked and inherited Markdown notices differ.');
for (const key of Object.keys(lock.packages)) if (/node_modules\/(jspdf|dompurify|html2canvas|canvg)$/.test(key)) throw Error('Excluded PDF package returned: ' + key);
async function scan(folder) {
 for (const entry of await readdir(folder, { withFileTypes: true })) {
  const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), folder);
  if (entry.isDirectory()) await scan(path);
  else if (entry.name.endsWith('.js')) {
   const text = await readFile(path, 'utf8');
   if (/Joseph Myers|function md5cycle|function md5Bin|function rc4/.test(text)) throw Error('Excluded implementation in PDF distribution: ' + fileURLToPath(path));
  }
 }
}
await scan(vendor);
const syntaxRoot=new URL('vendor/highlightjs-11.12.0/',root);
const syntaxManifest=JSON.parse(await readFile(new URL('source-manifest.json',syntaxRoot),'utf8'));
for(const item of syntaxManifest.files){
 const bytes=await readFile(new URL(item.path,syntaxRoot));
 if(hash(bytes)!==item.sha256)throw Error('Unreviewed syntax source: '+item.path);
 const original=item.path==='core.mjs'?Buffer.from(bytes.toString().replace('export default highlight;','module.exports = highlight;')):bytes;
 if(hash(original)!==item.sourceSha256)throw Error('Syntax upstream attribution differs: '+item.path);
}
if(hash(await readFile(new URL('static/licenses/highlightjs-11.12.0.txt',root)))!==syntaxManifest.noticeSha256)throw Error('Syntax notice differs');
const thirdParty = await readFile(new URL('static/licenses/THIRD_PARTY_NOTICES.txt', root), 'utf8');
if (!thirdParty.includes('Svelte') || !thirdParty.includes('Permission is hereby granted')) throw Error('Browser module notices are missing.');
console.log('Reviewed PDF subset, excluded dependencies and browser notices verified.');
