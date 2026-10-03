import { randomBytes, scryptSync } from 'node:crypto';
import { Client } from 'pg';
import { assertSampleDatabaseEmpty, catalogFor, initializeRequiredData, installSamples } from './install-data.mjs';

const input = {
	username: process.env.INITIAL_ADMIN_USERNAME?.trim(),
	password: process.env.INITIAL_ADMIN_PASSWORD,
	employeeCode: process.env.INITIAL_ADMIN_EMPLOYEE_CODE?.trim(),
	firstName: process.env.INITIAL_ADMIN_FIRST_NAME?.trim(),
	lastName: process.env.INITIAL_ADMIN_LAST_NAME?.trim(),
	birthDate: process.env.INITIAL_ADMIN_BIRTH_DATE?.trim(),
	gender: process.env.INITIAL_ADMIN_GENDER?.trim(),
	email: process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase(),
	hiredAt: process.env.INITIAL_ADMIN_HIRED_AT?.trim(),
	employmentType: process.env.INITIAL_ADMIN_EMPLOYMENT_TYPE?.trim(),
	branch: process.env.INITIAL_ADMIN_BRANCH?.trim(),
	displayLanguage: process.env.INITIAL_ADMIN_DISPLAY_LANGUAGE?.trim() || 'en'
};

const validDate = (value) => {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
	const date = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
if (!process.env.DATABASE_URL) throw new Error('The database connection is required.');
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
	await client.connect();
	await client.query('BEGIN');
	await client.query('SELECT pg_advisory_xact_lock($1)', [814_623_507]);
	const accounts = await client.query("SELECT count(*)::int AS count FROM employees WHERE account_status <> 'unprovisioned' AND deleted_at IS NULL");
	if (accounts.rows[0].count === 0) {
		if (Object.values(input).some((value) => !value)) throw new Error('The initial administrator profile is required.');
		if (!/^[A-Za-z0-9]{10,64}$/.test(input.employeeCode) || input.username.length > 64 ||
			input.password.length < 12 || input.password.length > 1024 || /[\x00-\x1f\x7f]/.test(input.password) || !/[a-z]/.test(input.password) || !/[A-Z]/.test(input.password) || !/[0-9]/.test(input.password) ||
			!validDate(input.birthDate) || !validDate(input.hiredAt) || !['female', 'male', 'unspecified'].includes(input.gender) || !['en', 'ja'].includes(input.displayLanguage) ||
			!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
			throw new Error('The initial administrator profile does not meet the requirements.');
		}
		const samples = process.env.INITIAL_ADMIN_SAMPLE_DATA ?? 'no';
		if (!['no', 'yes'].includes(samples)) throw new Error('Invalid sample data selection.');
		if (samples === 'yes') await assertSampleDatabaseEmpty(client);
		const catalog = catalogFor(input.displayLanguage);
		const employmentTypeId = await initializeRequiredData(client, catalog, input);
		const salt = randomBytes(16).toString('base64url');
		const passwordHash = `scrypt$${salt}$${scryptSync(input.password, salt, 64).toString('base64url')}`;
		const role = await client.query(`SELECT DISTINCT r.id FROM roles r
			JOIN role_permissions rp ON rp.role_id = r.id AND rp.deleted_at IS NULL
			JOIN permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
			JOIN permission_operations po ON po.permission_id = p.id AND po.operation = 'system.manage' AND po.deleted_at IS NULL
			WHERE r.deleted_at IS NULL`);
		if (role.rowCount !== 1) throw new Error('The initial administrator master data is unavailable or ambiguous.');
		// Reuse an active branch when provisioning an existing database. Never revive a deleted branch.
		let branch = await client.query('SELECT id FROM branches WHERE name = $1 AND deleted_at IS NULL', [input.branch]);
		if (branch.rowCount === 0) branch = await client.query('INSERT INTO branches (name) VALUES ($1) RETURNING id', [input.branch]);
		const created = await client.query(
			`INSERT INTO employees (employee_code, first_name, last_name, birth_date, gender, email, hired_at, employment_type_id, branch_id, username, password_hash, account_status)
			 VALUES ($1, $2, $3, $4::date, $5, $6, $7::date, $8, $9, $10, $11, 'active'::"AccountStatus") RETURNING id`,
			[input.employeeCode, input.firstName, input.lastName, input.birthDate, input.gender, input.email, input.hiredAt, employmentTypeId, branch.rows[0].id, input.username, passwordHash]
		);
		await client.query('INSERT INTO employee_roles (employee_id, role_id) VALUES ($1, $2)', [created.rows[0].id, role.rows[0].id]);
		await client.query('INSERT INTO employee_settings (employee_id, display_language) VALUES ($1, $2)', [created.rows[0].id, input.displayLanguage]);
		if (samples === 'yes') await installSamples(client, catalog, { adminId: created.rows[0].id, branchId: branch.rows[0].id, displayLanguage: input.displayLanguage });
	}
	await client.query('COMMIT');
} catch (error) {
	await client.query('ROLLBACK').catch(() => undefined);
	throw error;
} finally {
	await client.end();
}
