// Explicitly approved name-only revision of the existing official 1.0.0 definition.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Client} from 'pg';
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
export async function renameStandardCalculator(client){
 const current=JSON.parse(readFileSync(new URL('../widgets/catalogue.json',import.meta.url),'utf8')).widgets.find(w=>w.id==='sph.calculator');
 const previous={...current,name:{ja:'電卓',en:'Calculator'}};
 await client.query("SELECT id FROM widget_sources WHERE source_key='sph-official' FOR UPDATE");
 const rows=(await client.query("SELECT r.id,r.version,r.definition,r.digest FROM widget_releases r JOIN widget_sources s ON s.id=r.source_id WHERE s.source_key='sph-official' AND r.widget_code='sph.calculator' FOR UPDATE OF r")).rows;
 let changed=0;
 for(const row of rows){
  if(row.version!=='1.0.0'||row.digest!==hash(row.definition))throw Error('Unexpected calculator definition');
  if(canonical(row.definition)===canonical(current))continue;
  if(canonical(row.definition)!==canonical(previous))throw Error('Unexpected calculator definition');
  await client.query('UPDATE widget_releases SET definition=$2::jsonb,digest=$3 WHERE id=$1',[row.id,JSON.stringify(current),hash(current)]);changed++;
 }
 return {checked:rows.length,changed};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const db=new Client({connectionString:process.env.DATABASE_URL});
 try{await db.connect();await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");const result=await renameStandardCalculator(db);await db.query(process.argv.includes('--apply')?'COMMIT':'ROLLBACK');console.log(JSON.stringify({mode:process.argv.includes('--apply')?'applied':'dry-run',...result}));}
 catch{await db.query('ROLLBACK').catch(()=>{});console.error('Standard calculator rename failed; transaction rolled back.');process.exitCode=1;}
 finally{await db.end();}
}
