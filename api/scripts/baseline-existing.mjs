import { createHash } from 'node:crypto';
import { readFileSync, createReadStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Client } from 'pg';

// Explicit maintenance operation only; never called by deployment or startup.
// Current-baseline verification only. Historical migration rewrites are retired.
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
 if (history.length!==1 || history[0].migration_name!==definition.migration || history[0].checksum!==digest(sql) || !history[0].finished_at || history[0].rolled_back_at || history[0].logs) {
  throw new Error('This installation does not use the current fresh-install baseline. Historical migration transitions are unsupported; no history was changed.');
 }
 await client.query('COMMIT');
 console.log('Current fresh-install baseline verified; no migration history was changed.');

} catch (error) {
 await client.query('ROLLBACK').catch(()=>undefined);
 throw error;
} finally { await client.end(); }
