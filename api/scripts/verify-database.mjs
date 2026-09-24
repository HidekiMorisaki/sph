import { Client } from 'pg';

const tables = [
	'employees', 'roles', 'employee_roles', 'departments', 'employee_groups', 'positions', 'employment_types',
	'storage_locations', 'branches', 'rooms', 'desks', 'it_assets', 'it_asset_types', 'manufacturers',
	'cpu_types', 'operating_systems', 'it_asset_statuses', 'chairs', 'desk_assignments',
	'it_asset_assignments', 'it_asset_change_history', 'chair_assignments', 'audit_logs', 'sessions', 'password_reset_tokens', 'account_invitations'
];
const naturalKeyIndexes = [
	'employees_employee_code_key', 'employees_email_key', 'roles_code_key', 'employee_roles_employee_id_role_id_scope_type_scope_key_key', 'departments_code_key', 'employee_groups_code_key',
	'positions_code_key', 'employment_types_code_key', 'storage_locations_code_key', 'branches_code_key', 'rooms_code_key',
	'desks_asset_tag_key', 'it_assets_asset_tag_key', 'it_asset_types_code_key', 'manufacturers_code_key',
	'cpu_types_code_key', 'operating_systems_code_key', 'it_asset_statuses_code_key', 'chairs_asset_tag_key',
	'desk_assignments_desk_id_assigned_at_key', 'it_asset_assignments_asset_id_assigned_at_key',
	'chair_assignments_chair_id_assigned_at_key', 'it_asset_change_history_event_key_key', 'audit_logs_event_key_key',
	'sessions_token_hash_key', 'password_reset_tokens_token_hash_key', 'account_invitations_token_hash_key'
];
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
	await client.connect();
	const tableList = tables.map((name) => `'${name}'`).join(',');
	const count = async (sql) => Number((await client.query(sql)).rows[0].count);
	const missingCommonColumns = await count(`
		SELECT count(*) FROM (
			SELECT table_name FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name IN (${tableList})
				AND column_name IN ('id', 'created_at', 'updated_at', 'deleted_at')
			GROUP BY table_name HAVING count(*) <> 4
		) missing
	`);
	const autoIncrementIntegerIds = await count(`
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name IN (${tableList}) AND column_name = 'id'
			AND data_type = 'integer' AND column_default LIKE 'nextval%'
	`);
	const timestampColumns = await count(`
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name IN (${tableList})
			AND column_name IN ('created_at', 'updated_at', 'deleted_at') AND data_type = 'timestamp with time zone'
	`);
	const naturalKeys = await count(`
		SELECT count(*) FROM unnest(ARRAY[${naturalKeyIndexes.map((name) => `'${name}'`).join(',')}]) AS key(name)
		WHERE to_regclass('public.' || key.name) IS NOT NULL
	`);
	const updatedAtTriggers = await count(`
		SELECT count(*) FROM information_schema.triggers
		WHERE trigger_schema = 'public' AND trigger_name LIKE '%_set_updated_at'
	`);
	const cascadeForeignKeys = await count(`
		SELECT count(*) FROM information_schema.referential_constraints
		WHERE constraint_schema = 'public' AND delete_rule = 'CASCADE'
	`);
	const removedEmployeeEmergencyContactColumns = await count(`
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'employees'
			AND column_name IN ('emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone')
	`);
	const removedEmployeeStatusColumn = await count(`
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'active'
	`);
	const requiredEmployeeColumns = await count(`
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'employees' AND is_nullable = 'NO'
			AND column_name IN ('employee_code', 'first_name', 'last_name', 'birth_date', 'gender', 'email', 'hired_at', 'employment_type_id', 'branch_id')
	`);
	const removedEmployeeEmailColumns = await count(`
		SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'employees'
			AND column_name IN ('work_email', 'login_email', 'personal_email')
	`);
	const locationNotesColumns = await count(`
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name IN ('branches', 'rooms', 'storage_locations')
			AND column_name = 'notes' AND data_type = 'text' AND is_nullable = 'YES'
	`);
	const removedLocationClassificationColumns = await count(`
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public'
			AND ((table_name = 'rooms' AND column_name = 'floor') OR (table_name = 'storage_locations' AND column_name = 'kind'))
	`);
	const requiredEmployeeReferences = await count(`
		SELECT count(*) FROM information_schema.referential_constraints
		WHERE constraint_schema = 'public' AND delete_rule = 'RESTRICT'
			AND constraint_name IN ('employees_employment_type_id_fkey', 'employees_branch_id_fkey')
	`);
	const softDeletedSessions = await count('SELECT count(*) FROM sessions WHERE deleted_at IS NOT NULL');
	await client.query(`UPDATE departments SET name = name WHERE code = 'GENERAL'`);
	const updatedAtTriggerVerified = await count(`
		SELECT count(*) FROM departments WHERE code = 'GENERAL' AND updated_at >= created_at
	`);
	const activeAccounts = await count("SELECT count(*) FROM employees WHERE account_status = 'active' AND deleted_at IS NULL");
	const roles = await count("SELECT count(*) FROM roles WHERE code IN ('system_administrator', 'business_administrator', 'general_user') AND deleted_at IS NULL");
	const activeEmployeesWithoutRoles = await count(`
		SELECT count(*) FROM employees e
		WHERE e.deleted_at IS NULL
			AND NOT EXISTS (
				SELECT 1 FROM employee_roles er
				JOIN roles r ON r.id = er.role_id AND r.deleted_at IS NULL
				WHERE er.employee_id = e.id AND er.scope_type = 'global' AND er.deleted_at IS NULL
			)
	`);
	const removedUsersTable = await count("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'");
	const result = { missingCommonColumns, autoIncrementIntegerIds, timestampColumns, naturalKeys, updatedAtTriggers, cascadeForeignKeys, removedEmployeeEmergencyContactColumns, removedEmployeeStatusColumn, removedEmployeeEmailColumns, locationNotesColumns, removedLocationClassificationColumns, requiredEmployeeColumns, requiredEmployeeReferences, softDeletedSessions, updatedAtTriggerVerified, activeAccounts, roles, activeEmployeesWithoutRoles, removedUsersTable };
	console.log(JSON.stringify(result));
	if (missingCommonColumns !== 0 || autoIncrementIntegerIds !== tables.length || timestampColumns !== tables.length * 3 || naturalKeys !== naturalKeyIndexes.length || updatedAtTriggers !== tables.length || cascadeForeignKeys !== 0 || removedEmployeeEmergencyContactColumns !== 0 || removedEmployeeEmailColumns !== 0 || locationNotesColumns !== 3 || removedLocationClassificationColumns !== 0 || requiredEmployeeColumns !== 9 || requiredEmployeeReferences !== 2 || softDeletedSessions < 1 || updatedAtTriggerVerified !== 1 || activeAccounts < 1 || roles !== 3 || activeEmployeesWithoutRoles !== 0 || removedUsersTable !== 0) {
		process.exitCode = 1;
	}
} finally {
	await client.end();
}
