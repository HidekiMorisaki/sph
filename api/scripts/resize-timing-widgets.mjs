// Explicitly requested Timer 1x2 and Stopwatch 2x2 footprints.
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';import {Client} from 'pg';
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
export async function resizeTimingWidgets(client){
 const catalogue=JSON.parse(readFileSync(new URL('../widgets/catalogue.json',import.meta.url),'utf8')).widgets;
 const changed=[];let checked=0;
 await client.query("SELECT id FROM widget_sources WHERE source_key='sph-official' FOR UPDATE");
 for(const code of ['sph.timer','sph.stopwatch']){
 const current=catalogue.find(w=>w.id===code);
 const previous=[{...current,sizeLayouts:{small:{rows:2,columns:1}}},...(code==='sph.timer'?[{...current,sizeLayouts:{small:{rows:2,columns:2}}}]:[])];
 const rows=(await client.query("SELECT r.id,r.version,r.definition,r.digest FROM widget_releases r JOIN widget_sources s ON s.id=r.source_id WHERE s.source_key='sph-official' AND r.widget_code=$1 FOR UPDATE OF r",[code])).rows;
 checked+=rows.length;
 for(const row of rows){
  if(row.version!=='1.0.0'||row.digest!==hash(row.definition))throw Error('Unexpected timing definition');
  if(canonical(row.definition)===canonical(current))continue;
  if(!previous.some(definition=>canonical(row.definition)===canonical(definition)))throw Error('Unexpected timing definition');
  await client.query('UPDATE widget_releases SET definition=$2::jsonb,digest=$3 WHERE id=$1',[row.id,JSON.stringify(current),hash(current)]);changed.push(row.id);
 }
 }
 const instances=(await client.query("UPDATE widget_instances SET size='small' WHERE deleted_at IS NULL AND release_id=ANY($1::int[]) AND size<>'small' RETURNING id",[changed])).rows.map(r=>r.id);
 const layouts=(await client.query('UPDATE widget_layouts l SET revision=revision+1 WHERE l.deleted_at IS NULL AND EXISTS (SELECT 1 FROM widget_instances i WHERE i.layout_id=l.id AND i.deleted_at IS NULL AND i.release_id=ANY($1::int[])) RETURNING l.id',[changed])).rows.map(r=>r.id);
 return {checked,changed:changed.length,instances,layouts};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const db=new Client({connectionString:process.env.DATABASE_URL});
 try{await db.connect();await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");const result=await resizeTimingWidgets(db);await db.query(process.argv.includes('--apply')?'COMMIT':'ROLLBACK');console.log(JSON.stringify({mode:process.argv.includes('--apply')?'applied':'dry-run',...result}));}
 catch{await db.query('ROLLBACK').catch(()=>{});console.error('Timing size update failed; transaction rolled back.');process.exitCode=1;}finally{await db.end();}
}
