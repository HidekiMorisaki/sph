// Fresh-install seed only. Operational databases are never accessed.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const widgets=JSON.parse(readFileSync(new URL('api/widgets/catalogue.json',root),'utf8')).widgets;
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
assert.equal(widgets.length,7);assert.equal(new Set(widgets.map(w=>w.id)).size,7);
assert.ok(widgets.every(w=>w.id.startsWith('sph.')&&w.version==='1.0.1'));
assert.ok(process.argv.slice(2).every(a=>['--write','--check'].includes(a)));
const quote=s=>s.replaceAll("'","''");
const sql=['-- BEGIN official-widget-seed',...widgets.map(w=>{
 const json=canonical(w),digest=createHash('sha256').update(json).digest('hex');
 return `INSERT INTO widget_releases(source_id,widget_code,version,definition,digest) SELECT id,'${quote(w.id)}','${quote(w.version)}','${quote(json)}'::jsonb,'${digest}' FROM widget_sources WHERE source_key='sph-official';`;
}),"INSERT INTO widget_approvals(release_id,allowed) SELECT id,false FROM widget_releases;",'-- END official-widget-seed'].join('\n');
const file=new URL('api/prisma/migrations/m0032/migration.sql',root),source=readFileSync(file,'utf8').replaceAll('\r\n','\n');
const pattern=/-- BEGIN official-widget-seed\n[\s\S]*?\n-- END official-widget-seed/;
assert.ok(pattern.test(source),'Fresh-install seed section is missing.');
if(process.argv.includes('--write'))writeFileSync(file,source.replace(pattern,()=>sql));
else assert.equal(source.match(pattern)[0],sql,'Fresh-install seed differs from the current catalogue.');
console.log('Fresh-install official widget seed: seven exact 1.0.1 definitions/digests.');
