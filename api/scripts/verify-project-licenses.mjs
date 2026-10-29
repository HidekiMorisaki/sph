import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),hash=value=>createHash('sha256').update(value).digest('hex');
const record=JSON.parse(readFileSync(new URL('licenses/fflate-0.8.3.json',root),'utf8'));
const lock=JSON.parse(readFileSync(new URL('package-lock.json',root),'utf8'));
if(lock.packages['node_modules/fflate']?.version!=='0.8.3')throw Error('Review the adopted fflate version and embedded sources before changing it.');
if(hash(readFileSync(new URL('node_modules/fflate/LICENSE',root)))!==record.licenseSha256)throw Error('fflate original license differs.');
for(const entry of record.embeddedSources)if(hash(readFileSync(new URL('licenses/'+entry.file,root)))!==entry.licenseSha256)throw Error('Embedded original license differs: '+entry.name);
console.log('fflate original and embedded UZIP.js MIT notices verified.');
