import { Client, types } from 'pg';

types.setTypeParser(1082, (value) => value);

const TABLE_ORDER = [
	'branches',
	'calendar_date_attributes',
	'employment_departments',
	'employment_positions',
	'employment_types',
	'external_links',
	'it_asset_statuses',
	'it_asset_types',
	'manufacturers',
	'operating_systems',
	'permissions',
	'roles',
	'work_calendars',
	'cpu_types',
	'employee_groups',
	'permission_operations',
	'role_permissions',
	'rooms',
	'work_calendar_days',
	'employees',
	'storage',
	'account_invitations',
	'employee_departments',
	'employee_positions',
	'employee_roles',
	'employee_settings',
	'employee_social_links',
	'it_assets',
	'password_reset_tokens',
	'sessions',
	'it_asset_assignments',
	'it_asset_management_codes'
];

const HISTORY_TABLES = new Set([
	'audit_logs',
	'calendar_holiday_imports',
	'employee_change_history',
	'it_asset_change_history'
]);

const RECORD_COLUMNS = new Set(['created_at', 'updated_at', 'deleted_at']);
const DEFERRED_COLUMNS = new Map([
	['branches', new Set(['manager_employee_id', 'deputy_manager_employee_id'])]
]);
const FK_OVERRIDES = new Map([
	['storage.branch_id', 'branches']
]);

function quoteIdentifier(value) {
	return `"${value.replaceAll('"', '""')}"`;
}

function literal(value, column) {
	if (value === null || value === undefined) return 'NULL';
	if (column.data_type === 'date') {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid DATE value for ${column.table_name}.${column.column_name}.`);
		return `DATE '${value}'`;
	}
	if (column.data_type.startsWith('timestamp')) {
		const timestamp = value instanceof Date ? value.toISOString() : String(value);
		return `${column.data_type.includes('with time zone') ? 'TIMESTAMPTZ' : 'TIMESTAMP'} '${timestamp.replaceAll("'", "''")}'`;
	}
	if (Buffer.isBuffer(value)) return `decode('${value.toString('hex')}', 'hex')`;
	if (typeof value === 'number' || typeof value === 'bigint') return String(value);
	if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
	const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
	return `'${text.replaceAll("'", "''")}'`;
}

function remap(value, targetTable, idMaps, label) {
	if (value === null || value === undefined) return null;
	const mapped = idMaps.get(targetTable)?.get(Number(value));
	if (mapped === undefined) throw new Error(`Active row ${label} references a missing active ${targetTable} row (${value}).`);
	return mapped;
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
	await client.connect();
	await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

	const tableResult = await client.query(`
		SELECT table_name
		FROM information_schema.columns
		WHERE table_schema = 'public' AND column_name = 'deleted_at'
		ORDER BY table_name
	`);
	const applicationTables = tableResult.rows.map((row) => row.table_name);
	const includedTables = applicationTables.filter((table) => !HISTORY_TABLES.has(table));
	const unknownTables = includedTables.filter((table) => !TABLE_ORDER.includes(table));
	const missingTables = TABLE_ORDER.filter((table) => !includedTables.includes(table));
	if (unknownTables.length || missingTables.length) {
		throw new Error(`Backup table configuration is stale (unknown: ${unknownTables.join(', ') || 'none'}; missing: ${missingTables.join(', ') || 'none'}).`);
	}

	const columnResult = await client.query(`
		SELECT table_name, column_name, data_type, udt_name, ordinal_position
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = ANY($1::text[])
		ORDER BY table_name, ordinal_position
	`, [TABLE_ORDER]);
	const columnsByTable = new Map(TABLE_ORDER.map((table) => [table, []]));
	for (const column of columnResult.rows) {
		if (!RECORD_COLUMNS.has(column.column_name)) columnsByTable.get(column.table_name).push(column);
	}

	const fkResult = await client.query(`
		SELECT source.relname AS source_table, source_column.attname AS source_column,
		       target.relname AS target_table, target_column.attname AS target_column
		FROM pg_constraint constraint_record
		JOIN pg_class source ON source.oid = constraint_record.conrelid
		JOIN pg_class target ON target.oid = constraint_record.confrelid
		JOIN LATERAL unnest(constraint_record.conkey, constraint_record.confkey) AS keys(source_number, target_number) ON TRUE
		JOIN pg_attribute source_column ON source_column.attrelid = source.oid AND source_column.attnum = keys.source_number
		JOIN pg_attribute target_column ON target_column.attrelid = target.oid AND target_column.attnum = keys.target_number
		WHERE constraint_record.contype = 'f' AND source.relnamespace = 'public'::regnamespace
	`);
	const fkTargets = new Map();
	for (const fk of fkResult.rows) {
		if (fk.target_column === 'id') fkTargets.set(`${fk.source_table}.${fk.source_column}`, fk.target_table);
	}
	for (const [key, target] of FK_OVERRIDES) fkTargets.set(key, target);

	const rowsByTable = new Map();
	const idMaps = new Map();
	for (const table of TABLE_ORDER) {
		const result = await client.query(`SELECT * FROM public.${quoteIdentifier(table)} WHERE deleted_at IS NULL ORDER BY id`);
		rowsByTable.set(table, result.rows);
		idMaps.set(table, new Map(result.rows.map((row, index) => [Number(row.id), index + 1])));
	}

	const generatedAt = new Date().toISOString();
	const allTables = applicationTables.map((table) => `public.${quoteIdentifier(table)}`).join(', ');
	const lines = [
		'-- Existing active-data recovery backup',
		`-- Generated from a repeatable-read snapshot at ${generatedAt}`,
		'-- PostgreSQL DATE values are emitted as DATE YYYY-MM-DD literals and must not be converted to timestamps.',
		'-- Restore into a database with the current initial migration already applied.',
		'-- IDs are reassigned from 1 per table and foreign keys use the reassigned IDs.',
		'-- Record-management timestamps are populated by database defaults and triggers.',
		'-- Change History, audit log, and import history data are intentionally not backed up.',
		'SET standard_conforming_strings = on;',
		'BEGIN;',
		`TRUNCATE TABLE ${allTables} RESTART IDENTITY;`,
		''
	];

	const deferredUpdates = [];
	for (const table of TABLE_ORDER) {
		const columns = columnsByTable.get(table);
		const deferred = DEFERRED_COLUMNS.get(table) ?? new Set();
		const rows = rowsByTable.get(table);
		lines.push(`-- ${table} (${rows.length} active rows)`);
		for (const [index, original] of rows.entries()) {
			const row = { ...original, id: index + 1 };
			for (const column of columns) {
				const key = `${table}.${column.column_name}`;
				if (deferred.has(column.column_name)) {
					if (row[column.column_name] !== null) deferredUpdates.push({ table, id: row.id, column, value: remap(row[column.column_name], fkTargets.get(key), idMaps, key) });
					row[column.column_name] = null;
					continue;
				}
				const targetTable = fkTargets.get(key);
				if (targetTable) row[column.column_name] = remap(row[column.column_name], targetTable, idMaps, key);
			}
			if (table === 'employee_roles' && row.scope_type !== 'global' && row.scope_key !== 'global') {
				const scopeTable = row.scope_type === 'department' ? 'employment_departments' : row.scope_type === 'employee' ? 'employees' : null;
				if (scopeTable) row.scope_key = String(remap(row.scope_key, scopeTable, idMaps, 'employee_roles.scope_key'));
			}
			const columnSql = columns.map((column) => quoteIdentifier(column.column_name)).join(', ');
			const valueSql = columns.map((column) => literal(row[column.column_name], column)).join(', ');
			lines.push(`INSERT INTO public.${quoteIdentifier(table)} (${columnSql}) VALUES (${valueSql});`);
		}
		lines.push('');
	}

	if (deferredUpdates.length) {
		lines.push('-- Deferred updates used to resolve circular foreign keys');
		for (const update of deferredUpdates) {
			lines.push(`UPDATE public.${quoteIdentifier(update.table)} SET ${quoteIdentifier(update.column.column_name)} = ${literal(update.value, update.column)} WHERE id = ${update.id};`);
		}
		lines.push('');
	}

	for (const table of applicationTables) {
		lines.push(`SELECT setval(pg_get_serial_sequence('public.${table}', 'id'), GREATEST(COALESCE(MAX(id), 0), 1), COALESCE(MAX(id), 0) > 0) FROM public.${quoteIdentifier(table)};`);
	}
	lines.push('COMMIT;', '');
	process.stdout.write(lines.join('\n'));
	await client.query('COMMIT');
} catch (error) {
	await client.query('ROLLBACK').catch(() => undefined);
	throw error;
} finally {
	await client.end();
}
