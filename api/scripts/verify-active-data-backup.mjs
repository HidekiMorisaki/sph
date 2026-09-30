import { readFile } from 'node:fs/promises';
import { Client, types } from 'pg';

types.setTypeParser(1082, (value) => value);

const excludedTables = new Set(['audit_logs', 'calendar_holiday_imports', 'employee_change_history', 'it_asset_change_history']);
const backupPath = process.argv[2];
if (!backupPath || !process.env.DATABASE_URL || !process.env.BACKUP_VERIFY_DATABASE_NAME) {
	throw new Error('Usage: DATABASE_URL=... BACKUP_VERIFY_DATABASE_NAME=... node scripts/verify-active-data-backup.mjs <backup.sql|->');
}

if (!/^[a-z][a-z0-9_]*_backup_verify$/.test(process.env.BACKUP_VERIFY_DATABASE_NAME)) throw new Error('The verification database name must end with _backup_verify.');
const targetUrl = new URL(process.env.DATABASE_URL);
targetUrl.pathname = `/${process.env.BACKUP_VERIFY_DATABASE_NAME}`;

const source = new Client({ connectionString: process.env.DATABASE_URL });
const target = new Client({ connectionString: targetUrl.toString() });

function comparable(value) {
	if (value instanceof Date) return value.toISOString();
	if (Buffer.isBuffer(value)) return value.toString('hex');
	if (value && typeof value === 'object') return JSON.stringify(value);
	return value;
}

async function readStandardInput() {
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	return Buffer.concat(chunks).toString('utf8');
}

try {
	await Promise.all([source.connect(), target.connect()]);
	const sql = backupPath === '-' ? await readStandardInput() : await readFile(backupPath, 'utf8');
	await target.query(sql);

	const tablesResult = await source.query(`
		SELECT table_name
		FROM information_schema.columns
		WHERE table_schema = 'public' AND column_name = 'deleted_at'
		ORDER BY table_name
	`);
	const tables = tablesResult.rows.map((row) => row.table_name);
	for (const table of tables) {
		const quoted = `"${table.replaceAll('"', '""')}"`;
		const targetCount = Number((await target.query(`SELECT COUNT(*) AS count FROM public.${quoted}`)).rows[0].count);
		if (excludedTables.has(table)) {
			if (targetCount !== 0) throw new Error(`${table} should be empty after restore.`);
			continue;
		}
		const columnsResult = await source.query(`
			SELECT column_name, data_type
			FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = $1
			  AND column_name NOT IN ('id', 'created_at', 'updated_at', 'deleted_at')
			ORDER BY ordinal_position
		`, [table]);
		const columns = columnsResult.rows;
		const dateColumns = columns.filter((column) => column.data_type === 'date');
		const selection = columns.map((column) => `"${column.column_name.replaceAll('"', '""')}"`).join(', ');
		const sourceRows = (await source.query(`SELECT ${selection || 'id'} FROM public.${quoted} WHERE deleted_at IS NULL ORDER BY id`)).rows;
		const targetRows = (await target.query(`SELECT id${selection ? `, ${selection}` : ''} FROM public.${quoted} ORDER BY id`)).rows;
		if (sourceRows.length !== targetRows.length || targetCount !== sourceRows.length) throw new Error(`${table} row count mismatch.`);
		for (let index = 0; index < targetRows.length; index += 1) {
			if (Number(targetRows[index].id) !== index + 1) throw new Error(`${table} IDs are not contiguous.`);
			for (const column of dateColumns) {
				if (comparable(sourceRows[index][column.column_name]) !== comparable(targetRows[index][column.column_name])) {
					throw new Error(`${table}.${column.column_name} changed during backup restore at row ${index + 1}.`);
				}
			}
		}
		const deleted = Number((await target.query(`SELECT COUNT(*) AS count FROM public.${quoted} WHERE deleted_at IS NOT NULL`)).rows[0].count);
		if (deleted !== 0) throw new Error(`${table} contains deleted rows after restore.`);
	}

	console.log(JSON.stringify({ verified: true, tables: tables.length, dateValuesPreserved: true, idsContiguous: true }));
} finally {
	await Promise.allSettled([source.end(), target.end()]);
}
