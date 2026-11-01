// Generate UI names and embedded-language dependencies from the approved subset.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import highlight from '../vendor/highlightjs-11.12.0/core.mjs';
const root=new URL('../vendor/highlightjs-11.12.0/languages/',import.meta.url);
const names=(await readdir(root)).filter(name=>name.endsWith('.js')).sort();
for(const file of names){const {default:definition}=await import(new URL(file,root));highlight.registerLanguage(file.slice(0,-3),definition);}
const rows=[];
for(const file of names){
 const id=file.slice(0,-3),language=highlight.getLanguage(id),source=await readFile(new URL(file,root),'utf8');
 const embedded=[...source.matchAll(/subLanguage:\s*(['"][^'"]+['"]|\[[\s\S]*?\])/g)].flatMap(m=>[...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(v=>v[1]));
 rows.push({id,name:language.name??id,aliases:language.aliases??[],embedded:[...new Set(embedded.filter(name=>highlight.getLanguage(name)))]});
}
const output=JSON.stringify(rows,null,2)+'\n',path=new URL('../src/lib/project-code-languages.json',import.meta.url);
if(process.argv.includes('--check')){if(await readFile(path,'utf8')!==output)throw Error('Highlight language catalogue differs');}else await writeFile(path,output);
console.log(JSON.stringify({languages:rows.length,aliases:rows.reduce((sum,row)=>sum+row.aliases.length,0),catalogueVerified:true}));
