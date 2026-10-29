// First-party authoring tool; uses the already adopted TypeScript compiler.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),source=new URL('api/widgets/official/',root),ts=createRequire(new URL('frontend/package.json',root))('typescript');
const widgets=readdirSync(source,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>{const dir=new URL(d.name+'/',source),metadata=JSON.parse(readFileSync(new URL('manifest.json',dir),'utf8'));const logic=(()=>{try{return ts.transpile(readFileSync(new URL('logic.ts',dir),'utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}).replace(/^export /gm,'');}catch(e){if(e.code==='ENOENT')return '';throw e;}})();return {...metadata,runtime:{sdkVersion:1,html:readFileSync(new URL('view.html',dir),'utf8'),css:readFileSync(new URL('style.css',dir),'utf8'),javascript:logic+'\n'+readFileSync(new URL('main.js',dir),'utf8')}};});
// Regenerate the fresh-install SQL separately with build-widget-seed.mjs.
const output=JSON.stringify({schemaVersion:2,widgets},null,2)+'\n';
const target=new URL('api/widgets/catalogue.json',root);
if(process.argv.includes('--check')) {
 if(readFileSync(target,'utf8')!==output)throw Error('Official widget catalogue is stale.');
} else writeFileSync(target,output);
console.log(`Official catalogue: ${widgets.length} SDK widgets; run build-widget-seed.mjs --check to verify fresh-install SQL.`);
