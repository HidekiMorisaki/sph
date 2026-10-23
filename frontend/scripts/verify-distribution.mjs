import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const vendor = new URL('vendor/jspdf/', root);
const manifest = JSON.parse(await readFile(new URL('source-manifest.json', vendor), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
for (const entry of manifest.files) {
 if (hash(await readFile(new URL(entry.path, vendor))) !== entry.sha256) throw Error('PDF source differs from reviewed manifest: ' + entry.path);
}
const notice = await readFile(new URL('static/licenses/jspdf-SPH-NOTICES.txt', root));
if (hash(notice) !== manifest.noticeSha256) throw Error('PDF distribution notices changed without review.');
const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
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
const thirdParty = await readFile(new URL('static/licenses/THIRD_PARTY_NOTICES.txt', root), 'utf8');
if (!thirdParty.includes('Svelte') || !thirdParty.includes('Permission is hereby granted')) throw Error('Browser module notices are missing.');
console.log('Reviewed PDF subset, excluded dependencies and browser notices verified.');
