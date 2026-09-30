import { Client } from 'pg';

const tables = [
	'employees', 'employee_settings', 'employee_social_links', 'roles', 'permissions', 'permission_operations', 'role_permissions', 'employee_roles', 'employee_departments', 'employee_positions', 'employment_departments', 'employee_groups', 'employment_positions', 'employment_types',
	'storage', 'branches', 'rooms', 'it_assets', 'it_asset_types', 'manufacturers',
	'cpu_types', 'operating_systems', 'it_asset_statuses', 'it_asset_assignments', 'it_asset_management_codes',
	'it_asset_change_history', 'employee_change_history', 'audit_logs', 'sessions', 'password_reset_tokens', 'account_invitations',
	'work_calendars', 'work_calendar_days', 'calendar_date_attributes', 'calendar_holiday_imports', 'external_links'
];
const naturalKeyIndexes = [
	'employees_employee_code_key', 'employees_email_key', 'employee_settings_employee_id_key', 'employee_social_links_employee_id_platform_key', 'roles_name_key', 'permissions_identifier_key', 'permissions_name_key', 'permission_operations_operation_key', 'role_permissions_role_id_permission_id_key', 'employee_roles_employee_id_role_id_scope_type_scope_key_key', 'employee_departments_employee_id_department_id_key', 'employee_positions_employee_id_position_id_key', 'employment_departments_name_key', 'employee_groups_department_id_name_key', 'employee_groups_unassigned_name_key',
	'employment_positions_name_key', 'employment_types_name_key', 'storage_branch_id_room_id_name_key', 'branches_name_key', 'rooms_branch_id_name_key',
	'it_assets_asset_tag_key', 'it_asset_management_codes_code_key', 'it_asset_types_name_key', 'manufacturers_name_key',
	'cpu_types_name_key', 'operating_systems_display_name_key', 'it_asset_statuses_name_key',
	'it_asset_assignments_asset_id_assigned_at_key', 'it_asset_change_history_event_key_key', 'employee_change_history_event_key_key', 'audit_logs_event_key_key',
	'sessions_token_hash_key', 'password_reset_tokens_token_hash_key', 'account_invitations_token_hash_key',
	'work_calendars_name_key', 'work_calendar_days_calendar_id_work_date_key',
	'calendar_date_attributes_calendar_date_kind_key', 'calendar_holiday_imports_import_key_key', 'external_links_name_key'
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
	const branchDateColumns = await count(`
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'branches' AND is_nullable = 'YES' AND data_type = 'date'
			AND column_name IN ('opened_on', 'closed_on')
	`);
	const branchDateOrderConstraint = await count(`
		SELECT count(*) FROM information_schema.table_constraints
		WHERE constraint_schema = 'public' AND table_name = 'branches'
			AND constraint_name = 'branches_date_order' AND constraint_type = 'CHECK'
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
		WHERE table_schema = 'public' AND table_name IN ('branches', 'rooms', 'storage', 'employment_positions', 'employment_departments', 'employee_groups', 'employment_types', 'it_asset_types', 'it_asset_statuses', 'manufacturers', 'cpu_types', 'operating_systems', 'work_calendars') AND column_name = 'code'
	`);
	const employmentSortOrderColumns = await count(`
		SELECT count(*) FROM information_schema.columns AS sort_column
		JOIN information_schema.columns AS name_column
			ON name_column.table_schema = sort_column.table_schema
			AND name_column.table_name = sort_column.table_name
			AND name_column.column_name = 'name'
		WHERE sort_column.table_schema = 'public'
			AND sort_column.table_name IN ('employment_departments', 'employment_positions', 'employment_types', 'employee_groups')
			AND sort_column.column_name = 'sort_order'
			AND sort_column.ordinal_position = name_column.ordinal_position + 1
			AND sort_column.data_type = 'integer'
			AND sort_column.is_nullable = 'NO'
			AND sort_column.column_default = '9999'
	`);
	const itAssetMasterSortOrderColumns = await count(`
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name IN ('it_asset_types', 'manufacturers', 'cpu_types', 'operating_systems', 'it_asset_statuses')
			AND column_name = 'sort_order'
			AND data_type = 'integer'
			AND is_nullable = 'NO'
			AND column_default = '9999'
	`);
	const locationSortOrderColumns = await count(`
		SELECT count(*) FROM information_schema.columns AS sort_column
		JOIN information_schema.columns AS name_column
			ON name_column.table_schema = sort_column.table_schema
			AND name_column.table_name = sort_column.table_name
			AND name_column.column_name = 'name'
		WHERE sort_column.table_schema = 'public'
			AND sort_column.table_name IN ('branches', 'rooms', 'storage')
			AND sort_column.column_name = 'sort_order'
			AND sort_column.ordinal_position = name_column.ordinal_position + 1
			AND sort_column.data_type = 'integer'
			AND sort_column.is_nullable = 'NO'
			AND sort_column.column_default = '9999'
	`);
	const legacyEmploymentTables = await count(`
		SELECT count(*) FROM information_schema.tables
		WHERE table_schema = 'public' AND table_name IN ('departments', 'positions')
	`);
	const removedRoleCodeColumn = await count(`
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'code'
	`);
	const permissionIdentifiers = await count(`SELECT count(*) FROM permissions WHERE deleted_at IS NULL AND identifier IS NOT NULL`);
	const permissionMappings = await count(`SELECT count(*) FROM permission_operations WHERE deleted_at IS NULL AND operation IN ('system.manage', 'administration.manage', 'assets.manage')`);
	const immutablePermissionTrigger = await count(`
		SELECT count(*) FROM information_schema.triggers
		WHERE trigger_schema = 'public' AND event_object_table = 'permissions' AND trigger_name = 'permissions_identifier_immutable'
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
	const itAssetManagementCodeFormatConstraint = await count(`SELECT count(*) FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND table_name = 'it_assets' AND constraint_name = 'it_assets_asset_tag_format' AND constraint_type = 'CHECK'`);
	const unreservedItAssetCodes = await count(`SELECT count(*) FROM it_assets asset WHERE NOT EXISTS (SELECT 1 FROM it_asset_management_codes code WHERE code.code = asset.asset_tag)`);
	const requiredEmployeeReferences = await count(`
		SELECT count(*) FROM information_schema.referential_constraints
		WHERE constraint_schema = 'public' AND delete_rule = 'RESTRICT'
			AND constraint_name IN ('employees_employment_type_id_fkey', 'employees_branch_id_fkey')
	`);
	const employeePositionConstraints = await count(`
		SELECT count(*) FROM information_schema.referential_constraints
		WHERE constraint_schema = 'public' AND delete_rule = 'RESTRICT'
			AND constraint_name IN ('employee_positions_employee_id_fkey', 'employee_positions_position_id_fkey')
	`);
	const employeePositionPrimaryIndex = await count(`SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'employee_positions_one_active_primary'`);
	const employeeDepartmentConstraints = await count(`
		SELECT count(*) FROM information_schema.referential_constraints
		WHERE constraint_schema = 'public' AND delete_rule = 'RESTRICT'
			AND constraint_name IN ('employee_departments_employee_id_fkey', 'employee_departments_department_id_fkey')
	`);
	const employeeDepartmentPrimaryIndex = await count(`SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'employee_departments_one_active_primary'`);
	const removedPrimaryAssignmentColumns = await count(`
		SELECT count(*) FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'employees' AND column_name IN ('department_id', 'position_id')
	`);
	const duplicateActivePrimaryAssignments = await count(`
		SELECT count(*) FROM (
			SELECT employee_id FROM employee_departments WHERE deleted_at IS NULL AND is_primary GROUP BY employee_id HAVING count(*) > 1
			UNION ALL
			SELECT employee_id FROM employee_positions WHERE deleted_at IS NULL AND is_primary GROUP BY employee_id HAVING count(*) > 1
		) duplicates
	`);
	const softDeletedSessions = await count('SELECT count(*) FROM sessions WHERE deleted_at IS NOT NULL');
	await client.query(`
		UPDATE employment_departments SET name = name
		WHERE id = (SELECT id FROM employment_departments WHERE deleted_at IS NULL ORDER BY id LIMIT 1)
	`);
	const updatedAtTriggerVerified = await count(`
		SELECT count(*) FROM employment_departments
		WHERE id = (SELECT id FROM employment_departments WHERE deleted_at IS NULL ORDER BY id LIMIT 1)
			AND updated_at >= created_at
	`);
	const activeAccounts = await count("SELECT count(*) FROM employees WHERE account_status = 'active' AND deleted_at IS NULL");
	const roles = await count(`
		SELECT count(*) FROM roles r
		WHERE r.deleted_at IS NULL AND EXISTS (
			SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
			WHERE rp.role_id = r.id AND rp.deleted_at IS NULL
		)
	`);
	const activeEmployeesWithoutRoles = await count(`
		SELECT count(*) FROM employees e
		WHERE e.deleted_at IS NULL
			AND NOT EXISTS (
				SELECT 1 FROM employee_roles er
				JOIN roles r ON r.id = er.role_id AND r.deleted_at IS NULL
				WHERE er.employee_id = e.id AND er.scope_type = 'global' AND er.deleted_at IS NULL
			)
	`);
	const activeRoleGrantsReferencingDeletedEmployees = await count(`
		SELECT count(*) FROM employee_roles er
		WHERE er.deleted_at IS NULL
			AND (
				EXISTS (SELECT 1 FROM employees e WHERE e.id = er.employee_id AND e.deleted_at IS NOT NULL)
				OR EXISTS (SELECT 1 FROM employees e WHERE e.id = er.scope_employee_id AND e.deleted_at IS NOT NULL)
			)
	`);
	const removedUsersTable = await count("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'");
	const result = { missingCommonColumns, autoIncrementIntegerIds, timestampColumns, naturalKeys, updatedAtTriggers, cascadeForeignKeys, removedEmployeeEmergencyContactColumns, removedEmployeeStatusColumn, removedEmployeeEmailColumns, locationNotesColumns, branchContactColumns, branchResponsibilityColumns, branchDateColumns, branchDateOrderConstraint, branchResponsibilityForeignKeys, branchResponsibilityIndexes, removedLocationClassificationColumns, removedCodeColumns, employmentSortOrderColumns, itAssetMasterSortOrderColumns, locationSortOrderColumns, legacyEmploymentTables, removedRoleCodeColumn, permissionIdentifiers, permissionMappings, immutablePermissionTrigger, removedAssetTables, storageReferenceColumns, oldItAssetLocationColumn, storageRoomForeignKey, itAssetManagementCodeFormatConstraint, unreservedItAssetCodes, requiredEmployeeColumns, requiredEmployeeReferences, employeeDepartmentConstraints, employeeDepartmentPrimaryIndex, employeePositionConstraints, employeePositionPrimaryIndex, removedPrimaryAssignmentColumns, duplicateActivePrimaryAssignments, softDeletedSessions, updatedAtTriggerVerified, activeAccounts, roles, activeEmployeesWithoutRoles, activeRoleGrantsReferencingDeletedEmployees, removedUsersTable };
	console.log(JSON.stringify(result));
	if (missingCommonColumns !== 0 || autoIncrementIntegerIds !== tables.length || timestampColumns !== tables.length * 3 || naturalKeys !== naturalKeyIndexes.length || updatedAtTriggers !== tables.length || cascadeForeignKeys !== 0 || removedEmployeeEmergencyContactColumns !== 0 || removedEmployeeEmailColumns !== 0 || locationNotesColumns !== 3 || branchContactColumns !== 8 || branchResponsibilityColumns !== 2 || branchDateColumns !== 2 || branchDateOrderConstraint !== 1 || branchResponsibilityForeignKeys !== 2 || branchResponsibilityIndexes !== 2 || removedLocationClassificationColumns !== 0 || removedCodeColumns !== 0 || employmentSortOrderColumns !== 4 || itAssetMasterSortOrderColumns !== 5 || locationSortOrderColumns !== 3 || legacyEmploymentTables !== 0 || removedRoleCodeColumn !== 0 || permissionIdentifiers !== 3 || permissionMappings !== 3 || immutablePermissionTrigger !== 1 || removedAssetTables !== 0 || storageReferenceColumns !== 3 || oldItAssetLocationColumn !== 0 || storageRoomForeignKey !== 1 || itAssetManagementCodeFormatConstraint !== 1 || unreservedItAssetCodes !== 0 || requiredEmployeeColumns !== 9 || requiredEmployeeReferences !== 2 || employeeDepartmentConstraints !== 2 || employeeDepartmentPrimaryIndex !== 1 || employeePositionConstraints !== 2 || employeePositionPrimaryIndex !== 1 || removedPrimaryAssignmentColumns !== 0 || duplicateActivePrimaryAssignments !== 0 || updatedAtTriggerVerified !== 1 || activeAccounts < 1 || roles !== 3 || activeEmployeesWithoutRoles !== 0 || activeRoleGrantsReferencingDeletedEmployees !== 0 || removedUsersTable !== 0) {
		process.exitCode = 1;
	}
} finally {
	await client.end();
}
