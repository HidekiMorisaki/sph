import { Client } from 'pg';

const tables = [
	'employees', 'roles', 'employee_roles', 'departments', 'employee_groups', 'positions', 'employment_types',
	'storage', 'branches', 'rooms', 'it_assets', 'it_asset_types', 'manufacturers',
	'cpu_types', 'operating_systems', 'it_asset_statuses', 'it_asset_assignments',
	'it_asset_change_history', 'audit_logs', 'sessions', 'password_reset_tokens', 'account_invitations'
];
const naturalKeyIndexes = [
	'employees_employee_code_key', 'employees_email_key', 'roles_code_key', 'employee_roles_employee_id_role_id_scope_type_scope_key_key', 'departments_name_key', 'employee_groups_code_key',
	'positions_name_key', 'employment_types_name_key', 'storage_branch_id_room_id_name_key', 'branches_name_key', 'rooms_branch_id_name_key',
	'it_assets_asset_tag_key', 'it_asset_types_name_key', 'manufacturers_name_key',
	'cpu_types_display_name_key', 'operating_systems_display_name_key', 'it_asset_statuses_name_key',
	'it_asset_assignments_asset_id_assigned_at_key', 'it_asset_change_history_event_key_key', 'audit_logs_event_key_key',
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
		WHERE table_schema = 'public' AND table_name IN ('branches', 'rooms', 'storage')
			AND column_name = 'notes' AND data_type = 'text' AND is_nullable = 'YES'
	`);
	const branchContactColumns = await count(`
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'branches' AND is_nullable = 'YES'
			AND ((column_name IN ('phone_number_1', 'phone_number_2', 'fax_number_1', 'fax_number_2') AND character_maximum_length = 32)
				OR (column_name IN ('phone_number_1_label', 'phone_number_2_label', 'fax_number_1_label', 'fax_number_2_label') AND character_maximum_length = 128))
	`);
	const branchResponsibilityColumns = await count(`
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'branches' AND is_nullable = 'YES' AND data_type = 'integer'
			AND column_name IN ('manager_employee_id', 'deputy_manager_employee_id')
	`);
	const branchResponsibilityForeignKeys = await count(`
		SELECT count(*) FROM information_schema.referential_constraints
		WHERE constraint_schema = 'public' AND delete_rule = 'RESTRICT'
			AND constraint_name IN ('branches_manager_employee_id_fkey', 'branches_deputy_manager_employee_id_fkey')
	`);
	const branchResponsibilityIndexes = await count(`
		SELECT count(*) FROM unnest(ARRAY['branches_manager_employee_id_idx', 'branches_deputy_manager_employee_id_idx']) AS key(name)
		WHERE to_regclass('public.' || key.name) IS NOT NULL
	`);
	const removedLocationClassificationColumns = await count(`
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public'
			AND ((table_name = 'rooms' AND column_name = 'floor') OR (table_name = 'storage' AND column_name = 'kind'))
	`);
	const removedCodeColumns = await count(`
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name IN ('branches', 'rooms', 'storage', 'positions', 'departments', 'employment_types', 'it_asset_types', 'it_asset_statuses', 'manufacturers', 'cpu_types', 'operating_systems') AND column_name = 'code'
	`);
	const retainedRoleCodeColumn = await count(`
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'code' AND is_nullable = 'NO'
	`);
	const removedAssetTables = await count(`
		SELECT count(*) FROM information_schema.tables
		WHERE table_schema = 'public' AND table_name IN ('chairs', 'chair_assignments', 'desks', 'desk_assignments', 'storage_locations')
	`);
	const storageReferenceColumns = await count(`
		SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
		AND ((table_name = 'storage' AND column_name IN ('branch_id', 'room_id')) OR (table_name = 'it_assets' AND column_name = 'storage_id'))
	`);
	const oldItAssetLocationColumn = await count(`SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'it_assets' AND column_name = 'location_id'`);
	const storageRoomForeignKey = await count(`SELECT count(*) FROM information_schema.referential_constraints WHERE constraint_schema = 'public' AND constraint_name = 'storage_branch_id_room_id_fkey'`);
	const requiredEmployeeReferences = await count(`
		SELECT count(*) FROM information_schema.referential_constraints
		WHERE constraint_schema = 'public' AND delete_rule = 'RESTRICT'
			AND constraint_name IN ('employees_employment_type_id_fkey', 'employees_branch_id_fkey')
	`);
	const softDeletedSessions = await count('SELECT count(*) FROM sessions WHERE deleted_at IS NOT NULL');
	await client.query(`UPDATE departments SET name = name WHERE name = 'General Affairs'`);
	const updatedAtTriggerVerified = await count(`
		SELECT count(*) FROM departments WHERE name = 'General Affairs' AND updated_at >= created_at
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
	const result = { missingCommonColumns, autoIncrementIntegerIds, timestampColumns, naturalKeys, updatedAtTriggers, cascadeForeignKeys, removedEmployeeEmergencyContactColumns, removedEmployeeStatusColumn, removedEmployeeEmailColumns, locationNotesColumns, branchContactColumns, branchResponsibilityColumns, branchResponsibilityForeignKeys, branchResponsibilityIndexes, removedLocationClassificationColumns, removedCodeColumns, retainedRoleCodeColumn, removedAssetTables, storageReferenceColumns, oldItAssetLocationColumn, storageRoomForeignKey, requiredEmployeeColumns, requiredEmployeeReferences, softDeletedSessions, updatedAtTriggerVerified, activeAccounts, roles, activeEmployeesWithoutRoles, removedUsersTable };
	console.log(JSON.stringify(result));
	if (missingCommonColumns !== 0 || autoIncrementIntegerIds !== tables.length || timestampColumns !== tables.length * 3 || naturalKeys !== naturalKeyIndexes.length || updatedAtTriggers !== tables.length || cascadeForeignKeys !== 0 || removedEmployeeEmergencyContactColumns !== 0 || removedEmployeeEmailColumns !== 0 || locationNotesColumns !== 3 || branchContactColumns !== 8 || branchResponsibilityColumns !== 2 || branchResponsibilityForeignKeys !== 2 || branchResponsibilityIndexes !== 2 || removedLocationClassificationColumns !== 0 || removedCodeColumns !== 0 || retainedRoleCodeColumn !== 1 || removedAssetTables !== 0 || storageReferenceColumns !== 3 || oldItAssetLocationColumn !== 0 || storageRoomForeignKey !== 1 || requiredEmployeeColumns !== 9 || requiredEmployeeReferences !== 2 || updatedAtTriggerVerified !== 1 || activeAccounts < 1 || roles !== 3 || activeEmployeesWithoutRoles !== 0 || removedUsersTable !== 0) {
		process.exitCode = 1;
	}
} finally {
	await client.end();
}
