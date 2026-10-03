import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, createReadStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Client } from 'pg';
import { schemaSnapshot } from './schema-snapshot.mjs';

// Explicit maintenance operation only; never called by deployment or startup.
// Replaces only Prisma's history after a verified full backup and exact schema check.
const definition = JSON.parse(readFileSync(new URL('baseline-definition.json',import.meta.url),'utf8'));
const sql = readFileSync(new URL(`../prisma/migrations/${definition.migration}/migration.sql`,import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const connection = process.env.DATABASE_URL;
if (!connection || !process.argv[2]) throw new Error('Provide DATABASE_URL privately and a verified backup manifest path.');
const manifestPath = resolve(process.argv[2]);
const manifest = JSON.parse(readFileSync(manifestPath,'utf8'));
const archiveHash = createHash('sha256');
for await (const chunk of createReadStream(resolve(dirname(manifestPath),'database.dump'))) archiveHash.update(chunk);
if (manifest.formatVersion!==1 || manifest.application!=='SME Portal Hub' || manifest.verifiedRestore!==true || manifest.archiveFile!=='database.dump' ||
 manifest.databaseName!==decodeURIComponent(new URL(connection).pathname.slice(1)) ||
 archiveHash.digest('hex')!==manifest.sha256) throw new Error('The verified backup does not match the configured database.');
const client = new Client({connectionString:connection});
try {
 await client.connect(); await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock($1)',[814_623_507]);
 await client.query('LOCK TABLE _prisma_migrations IN ACCESS EXCLUSIVE MODE');
 const history = (await client.query('SELECT * FROM _prisma_migrations ORDER BY migration_name')).rows;
 const baseline = history.find(r=>r.migration_name===definition.migration && r.checksum===digest(sql) && r.finished_at && !r.rolled_back_at);
 if (baseline || (process.argv.includes('--if-legacy') && history.length===0)) {
  await client.query('COMMIT'); console.log('Consolidated baseline is already recorded.');
 } else {
  if (history.length!==definition.legacyMigrations.length || history.some((r,i) => r.migration_name!==definition.legacyMigrations[i].migration_name || r.checksum!==definition.legacyMigrations[i].checksum || !r.finished_at || r.rolled_back_at || r.logs)) throw new Error('Legacy migration history differs or includes an unfinished migration.');
  if (JSON.stringify(await schemaSnapshot(client))!==JSON.stringify(definition.schema)) throw new Error('Database schema differs from the consolidated baseline; no history was changed.');
  const archive = resolve(dirname(manifestPath),'migration-history-before-baseline.json');
  const archived = {backupId:manifest.backupId,baseline:definition.migration,baselineChecksum:digest(sql),history};
  if (existsSync(archive)) {
   if (JSON.stringify(JSON.parse(readFileSync(archive,'utf8')))!==JSON.stringify(archived)) throw new Error('A different archived migration history already exists.');
  } else writeFileSync(archive,JSON.stringify(archived,null,2)+'\n',{flag:'wx',mode:0o600});
  // Infrastructure metadata only. Application rows and their sequences are untouched.
  await client.query('DELETE FROM _prisma_migrations');
  await client.query('INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES ($1,$2,CURRENT_TIMESTAMP,$3,CURRENT_TIMESTAMP,0)',[randomUUID(),digest(sql),definition.migration]);
  await client.query('COMMIT');
  console.log('Recorded the consolidated baseline without executing schema SQL; previous migration history is retained with the full backup.');
 }
} catch (error) {
 await client.query('ROLLBACK').catch(()=>undefined);
 throw error;
} finally { await client.end(); }
