import { dev } from '$app/environment';
import { requireAdminApi, requireOperationApi, writeAuditLog } from '$lib/server/api/admin';
import { parseEmployeeInput } from '$lib/server/api/employee-input';
import { employeeConflictResponse } from '$lib/server/api/employee-errors';
import { employeeReferenceDate } from '$lib/server/api/employee-derived';
import { readEmployeeFields, recordEmployeeChange } from '$lib/server/api/employee-history';
import { employeeOutput, employeeSafeSelect } from '$lib/server/api/employee-output';
import { syncEmployeeDepartments } from '$lib/server/api/employee-departments';
import { syncEmployeePositions } from '$lib/server/api/employee-positions';
import { employeeReferenceErrors } from '$lib/server/api/employee-references';
import { canAssignRequestedRoles, createGlobalRoleGrants } from '$lib/server/api/employee-roles';
import { issueInvitation } from '$lib/server/auth/invitation';
import { hasPermissionOperation, permissionOperations } from '$lib/server/auth/permissions';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { containsPattern, parseVisibleSearch } from '$lib/server/api/visible-list-search';
import { failure, success, throwApiError } from '$lib/server/api/response';
import { allowsSensitiveRequest } from '$lib/server/api/sensitive-transport';
import { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';

const sortFields = ['id', 'employee', 'employeeCode', 'firstName', 'lastName', 'age', 'lengthOfService', 'department', 'group', 'position', 'employmentType', 'branch', 'roles', 'hiredAt', 'createdAt', 'updatedAt'] as const;

const employeeColumnKeys: Record<string, string> = {
	id: 'id',
	employee_code: 'employeeCode',
	first_name: 'firstName',
	middle_name: 'middleName',
	last_name: 'lastName',
	name_kana: 'nameKana',
	birth_date: 'birthDate',
	gender: 'gender',
	blood_type: 'bloodType',
	postal_code: 'postalCode',
	prefecture: 'prefecture',
	city: 'city',
	street_address: 'streetAddress',
	building_name: 'buildingName',
	mobile_phone: 'mobilePhone',
	email: 'email',
	hired_at: 'hiredAt',
	group_id: 'groupId',
	employment_type_id: 'employmentTypeId',
	branch_id: 'branchId',
	retired_at: 'retiredAt',
	notes: 'notes',
	created_at: 'createdAt',
	updated_at: 'updatedAt',
	deleted_at: 'deletedAt'
};

type EmployeeSortField = (typeof sortFields)[number];
const visibleSearchKeys = ['name', 'employeeCode', 'employmentStatus', 'age', 'lengthOfService', 'department', 'group', 'position', 'employmentType', 'branch', 'roles'] as const;
type DatabaseColumn = { columnName: string; comment: string | null };

function parseSearch(url: URL) {
	const search = url.searchParams.get('search')?.trim() ?? '';
	if (search.length > 200) {
		throwApiError(422, 'INVALID_SEARCH', 'search must be 200 characters or fewer.', [
			{ field: 'search', reason: 'TOO_LONG' }
		]);
	}
	return search;
}

function parseBooleanQuery(url: URL, name: string, errorCode: string) {
	const value = url.searchParams.get(name);
	if (value === null || value === 'false') return false;
	if (value === 'true') return true;
	throwApiError(422, errorCode, `${name} must be true or false.`, [
		{ field: name, reason: 'UNSUPPORTED_VALUE' }
	]);
}

type EmployeeVisibility = { includeRetired: boolean; includeDeleted: boolean; referenceDate: Date };

function employeeWhere(search: string, visibility: EmployeeVisibility): Prisma.EmployeeWhereInput {
	const visibleEmployees: Prisma.EmployeeWhereInput[] = [{
		deletedAt: null,
		...(visibility.includeRetired ? {} : { OR: [{ retiredAt: null }, { retiredAt: { gt: visibility.referenceDate } }] })
	}];
	if (visibility.includeDeleted) visibleEmployees.push({ deletedAt: { not: null } });
	if (!search) return { OR: visibleEmployees };
	const contains = { contains: search, mode: 'insensitive' as const };
	return {
		AND: [
			{ OR: visibleEmployees },
			{ OR: [
				{ employeeCode: contains },
				{ firstName: contains },
				{ middleName: contains },
				{ lastName: contains },
				{ nameKana: contains },
				{ postalCode: contains },
				{ prefecture: contains },
				{ city: contains },
				{ streetAddress: contains },
				{ buildingName: contains },
				{ mobilePhone: contains },
				{ email: contains },
				{ notes: contains },
				{ departmentAssignments: { some: { deletedAt: null, department: { deletedAt: null, name: contains } } } },
				{ group: { name: contains } },
				{ positionAssignments: { some: { deletedAt: null, position: { deletedAt: null, name: contains } } } },
				{ employmentType: { name: contains } },
				{ branch: { name: contains } }
			] }
		]
	};
}

function employeeOrderBy(sortBy: EmployeeSortField, sortOrder: 'asc' | 'desc'): Prisma.EmployeeOrderByWithRelationInput[] {
	switch (sortBy) {
		case 'employee': return [{ lastName: sortOrder }, { firstName: sortOrder }, { id: 'asc' }];
		case 'age': return [{ birthDate: sortOrder === 'asc' ? 'desc' : 'asc' }, { id: 'asc' }];
		case 'department': return [{ departmentAssignments: { _count: sortOrder } }, { id: 'asc' }];
		case 'group': return [{ group: { name: sortOrder } }, { id: 'asc' }];
		case 'position': return [{ positionAssignments: { _count: sortOrder } }, { id: 'asc' }];
		case 'employmentType': return [{ employmentType: { name: sortOrder } }, { id: 'asc' }];
		case 'branch': return [{ branch: { name: sortOrder } }, { id: 'asc' }];
		case 'roles': return [{ id: 'asc' }];
		case 'lengthOfService': return [{ id: 'asc' }];
		case 'id': return [{ id: sortOrder }];
		default: return [{ [sortBy]: sortOrder }, { id: 'asc' }];
	}
}

function employeeSqlSearchClause(search: string) {
	if (!search) return Prisma.empty;
	const pattern = `%${search}%`;
	return Prisma.sql`
		AND (
			employee.employee_code ILIKE ${pattern}
			OR employee.first_name ILIKE ${pattern}
			OR employee.middle_name ILIKE ${pattern}
			OR employee.last_name ILIKE ${pattern}
			OR employee.name_kana ILIKE ${pattern}
			OR employee.postal_code ILIKE ${pattern}
			OR employee.prefecture ILIKE ${pattern}
			OR employee.city ILIKE ${pattern}
			OR employee.street_address ILIKE ${pattern}
			OR employee.building_name ILIKE ${pattern}
			OR employee.mobile_phone ILIKE ${pattern}
			OR employee.email ILIKE ${pattern}
			OR employee.notes ILIKE ${pattern}
			OR department_values.names ILIKE ${pattern}
			OR employee_group.name ILIKE ${pattern}
			OR position_values.names ILIKE ${pattern}
			OR employment_type.name ILIKE ${pattern}
			OR branch.name ILIKE ${pattern}
		)
	`;
}

function employeeSqlVisibilityClause(visibility: EmployeeVisibility) {
	const referenceDateIso = visibility.referenceDate.toISOString().slice(0, 10);
	if (visibility.includeRetired && visibility.includeDeleted) return Prisma.empty;
	if (visibility.includeRetired) return Prisma.sql`AND employee.deleted_at IS NULL`;
	if (visibility.includeDeleted) return Prisma.sql`
		AND (
			employee.deleted_at IS NOT NULL
			OR employee.retired_at IS NULL
			OR employee.retired_at > CAST(${referenceDateIso} AS date)
		)
	`;
	return Prisma.sql`
		AND employee.deleted_at IS NULL
		AND (employee.retired_at IS NULL OR employee.retired_at > CAST(${referenceDateIso} AS date))
	`;
}

async function visibleEmployeePage(
	tx: Prisma.TransactionClient,
	search: string,
	keys: string[],
	locale: 'en' | 'ja',
	visibility: EmployeeVisibility,
	sortBy: EmployeeSortField,
	sortOrder: 'asc' | 'desc',
	offset: number,
	limit: number
) {
	const pattern = containsPattern(search);
	const referenceDateIso = visibility.referenceDate.toISOString().slice(0, 10);
	const referenceDate = Prisma.sql`CAST(${referenceDateIso} AS date)`;
	const ageMonths = Prisma.sql`GREATEST(0, (EXTRACT(YEAR FROM ${referenceDate})::int - EXTRACT(YEAR FROM employee.birth_date)::int) * 12
		+ EXTRACT(MONTH FROM ${referenceDate})::int - EXTRACT(MONTH FROM employee.birth_date)::int
		- CASE WHEN EXTRACT(DAY FROM ${referenceDate}) < EXTRACT(DAY FROM employee.birth_date) THEN 1 ELSE 0 END)`;
	const serviceEnd = Prisma.sql`LEAST(COALESCE(employee.retired_at, ${referenceDate}), ${referenceDate})`;
	const serviceMonths = Prisma.sql`GREATEST(0, (EXTRACT(YEAR FROM ${serviceEnd})::int - EXTRACT(YEAR FROM employee.hired_at)::int) * 12
		+ EXTRACT(MONTH FROM ${serviceEnd})::int - EXTRACT(MONTH FROM employee.hired_at)::int
		- CASE WHEN EXTRACT(DAY FROM ${serviceEnd}) < EXTRACT(DAY FROM employee.hired_at) THEN 1 ELSE 0 END)`;
	const years = Prisma.sql`(${serviceMonths}) / 12`;
	const months = Prisma.sql`(${serviceMonths}) % 12`;
	const serviceText = locale === 'ja'
		? Prisma.sql`concat(${years}, '年', ${months}, 'か月')`
		: Prisma.sql`concat(${years}, CASE WHEN ${years} = 1 THEN ' year' ELSE ' years' END, ' ', ${months}, CASE WHEN ${months} = 1 THEN ' month' ELSE ' months' END)`;
	const fields: Record<(typeof visibleSearchKeys)[number], Prisma.Sql> = {
		name: Prisma.sql`(employee.first_name ILIKE ${pattern} OR employee.middle_name ILIKE ${pattern} OR employee.last_name ILIKE ${pattern}
			OR concat_ws(' ', employee.first_name, employee.middle_name, employee.last_name) ILIKE ${pattern}
			OR concat_ws(' ', employee.last_name, employee.middle_name, employee.first_name) ILIKE ${pattern})`,
		employeeCode: Prisma.sql`employee.employee_code ILIKE ${pattern}`,
		employmentStatus: Prisma.sql`(CASE WHEN employee.deleted_at IS NOT NULL THEN ${locale === 'ja' ? '削除済み' : 'Deleted'}
			WHEN employee.retired_at <= ${referenceDate} THEN ${locale === 'ja' ? '退職済み' : 'Retired'} ELSE '' END) ILIKE ${pattern}`,
		age: Prisma.sql`((${ageMonths}) / 12)::text ILIKE ${pattern}`,
		lengthOfService: Prisma.sql`${serviceText} ILIKE ${pattern}`,
		department: Prisma.sql`EXISTS (SELECT 1 FROM employee_departments assignment JOIN employment_departments department
			ON department.id = assignment.department_id AND department.deleted_at IS NULL
			WHERE assignment.employee_id = employee.id AND assignment.deleted_at IS NULL AND department.name ILIKE ${pattern})`,
		group: Prisma.sql`employee_group.name ILIKE ${pattern}`,
		position: Prisma.sql`EXISTS (SELECT 1 FROM employee_positions assignment JOIN employment_positions position
			ON position.id = assignment.position_id AND position.deleted_at IS NULL
			WHERE assignment.employee_id = employee.id AND assignment.deleted_at IS NULL AND position.name ILIKE ${pattern})`,
		employmentType: Prisma.sql`employment_type.name ILIKE ${pattern}`,
		branch: Prisma.sql`branch.name ILIKE ${pattern}`,
		roles: Prisma.sql`EXISTS (SELECT 1 FROM employee_roles role_grant JOIN roles role ON role.id = role_grant.role_id AND role.deleted_at IS NULL
			WHERE role_grant.employee_id = employee.id AND role_grant.scope_type = 'global' AND role_grant.deleted_at IS NULL AND role.name ILIKE ${pattern})`
	};
	const match = Prisma.sql`(${Prisma.join(keys.map((key) => fields[key as keyof typeof fields]), ' OR ')})`;
	const visibilityClause = employeeSqlVisibilityClause(visibility);
	const from = Prisma.sql`FROM employees employee
		LEFT JOIN employee_groups employee_group ON employee_group.id = employee.group_id
		LEFT JOIN employment_types employment_type ON employment_type.id = employee.employment_type_id
		LEFT JOIN branches branch ON branch.id = employee.branch_id`;
	const count = await tx.$queryRaw<Array<{ total: number }>>(Prisma.sql`SELECT count(*)::int AS total ${from} WHERE true ${visibilityClause} AND ${match}`);
	const orderFields: Record<EmployeeSortField, Prisma.Sql> = {
		id: Prisma.sql`employee.id`, employee: Prisma.sql`employee.last_name`, employeeCode: Prisma.sql`employee.employee_code`,
		firstName: Prisma.sql`employee.first_name`, lastName: Prisma.sql`employee.last_name`,
		age: Prisma.sql`employee.birth_date`, lengthOfService: serviceMonths,
		department: Prisma.sql`(SELECT string_agg(department.name, '|' ORDER BY assignment.is_primary DESC, department.sort_order, department.name)
			FROM employee_departments assignment JOIN employment_departments department ON department.id = assignment.department_id AND department.deleted_at IS NULL
			WHERE assignment.employee_id = employee.id AND assignment.deleted_at IS NULL)`,
		group: Prisma.sql`employee_group.name`,
		position: Prisma.sql`(SELECT string_agg(position.name, '|' ORDER BY assignment.is_primary DESC, position.sort_order, position.name)
			FROM employee_positions assignment JOIN employment_positions position ON position.id = assignment.position_id AND position.deleted_at IS NULL
			WHERE assignment.employee_id = employee.id AND assignment.deleted_at IS NULL)`,
		employmentType: Prisma.sql`employment_type.name`, branch: Prisma.sql`branch.name`,
		roles: Prisma.sql`(SELECT string_agg(role.name, '|' ORDER BY role.name) FROM employee_roles role_grant
			JOIN roles role ON role.id = role_grant.role_id AND role.deleted_at IS NULL
			WHERE role_grant.employee_id = employee.id AND role_grant.scope_type = 'global' AND role_grant.deleted_at IS NULL)`,
		hiredAt: Prisma.sql`employee.hired_at`, createdAt: Prisma.sql`employee.created_at`, updatedAt: Prisma.sql`employee.updated_at`
	};
	const direction = (sortBy === 'age' ? sortOrder === 'asc' : sortOrder === 'desc') ? Prisma.sql`DESC` : Prisma.sql`ASC`;
	const ordering = sortBy === 'employee'
		? Prisma.sql`employee.last_name ${direction}, employee.first_name ${direction}`
		: Prisma.sql`${orderFields[sortBy]} ${direction} NULLS LAST`;
	const ordered = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
		SELECT employee.id ${from} WHERE true ${visibilityClause} AND ${match}
		ORDER BY ${ordering}, employee.id ASC OFFSET ${offset} LIMIT ${limit}`);
	const ids = ordered.map((row) => row.id);
	const records = await tx.employee.findMany({ where: { id: { in: ids } }, select: employeeSafeSelect });
	const byId = new Map(records.map((record) => [record.id, record]));
	return { total: count[0]?.total ?? 0, items: ids.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []) };
}

async function roleSortedEmployeeIds(
	tx: Prisma.TransactionClient,
	search: string,
	visibility: EmployeeVisibility,
	sortOrder: 'asc' | 'desc',
	offset: number,
	limit: number
): Promise<number[]> {
	const direction = sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
	const searchClause = employeeSqlSearchClause(search);
	const visibilityClause = employeeSqlVisibilityClause(visibility);
	const rows = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`
		SELECT employee.id
		FROM employees AS employee
		LEFT JOIN LATERAL (
			SELECT string_agg(department.name, '|' ORDER BY employee_department.is_primary DESC, department.sort_order, department.name, department.id) AS names
			FROM employee_departments AS employee_department
			JOIN employment_departments AS department ON department.id = employee_department.department_id AND department.deleted_at IS NULL
			WHERE employee_department.employee_id = employee.id AND employee_department.deleted_at IS NULL
		) AS department_values ON true
		LEFT JOIN employee_groups AS employee_group ON employee_group.id = employee.group_id
		LEFT JOIN LATERAL (
			SELECT string_agg(position.name, '|' ORDER BY employee_position.is_primary DESC, position.sort_order, position.name, position.id) AS names
			FROM employee_positions AS employee_position
			JOIN employment_positions AS position ON position.id = employee_position.position_id AND position.deleted_at IS NULL
			WHERE employee_position.employee_id = employee.id AND employee_position.deleted_at IS NULL
		) AS position_values ON true
		LEFT JOIN employment_types AS employment_type ON employment_type.id = employee.employment_type_id
		LEFT JOIN branches AS branch ON branch.id = employee.branch_id
		LEFT JOIN LATERAL (
			SELECT string_agg(role.name, '|' ORDER BY role.name ASC) AS sort_key
			FROM employee_roles AS employee_role
			JOIN roles AS role ON role.id = employee_role.role_id AND role.deleted_at IS NULL
			WHERE employee_role.employee_id = employee.id
				AND employee_role.scope_type = 'global'
				AND employee_role.deleted_at IS NULL
		) AS role_values ON true
		WHERE true
		${visibilityClause}
		${searchClause}
		ORDER BY role_values.sort_key ${direction}, employee.id ASC
		OFFSET ${offset}
		LIMIT ${limit}
	`);
	return rows.map((row) => row.id);
}

async function assignmentSortedEmployeeIds(
	tx: Prisma.TransactionClient,
	search: string,
	visibility: EmployeeVisibility,
	sortBy: 'department' | 'position',
	sortOrder: 'asc' | 'desc',
	offset: number,
	limit: number
): Promise<number[]> {
	const direction = sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
	const sortKey = sortBy === 'department' ? Prisma.sql`department_values.names` : Prisma.sql`position_values.names`;
	const searchClause = employeeSqlSearchClause(search);
	const visibilityClause = employeeSqlVisibilityClause(visibility);
	const rows = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`
		SELECT employee.id
		FROM employees AS employee
		LEFT JOIN employee_groups AS employee_group ON employee_group.id = employee.group_id
		LEFT JOIN LATERAL (
			SELECT string_agg(department.name, '|' ORDER BY employee_department.is_primary DESC, department.sort_order, department.name, department.id) AS names
			FROM employee_departments AS employee_department
			JOIN employment_departments AS department ON department.id = employee_department.department_id AND department.deleted_at IS NULL
			WHERE employee_department.employee_id = employee.id AND employee_department.deleted_at IS NULL
		) AS department_values ON true
		LEFT JOIN LATERAL (
			SELECT string_agg(position.name, '|' ORDER BY employee_position.is_primary DESC, position.sort_order, position.name, position.id) AS names
			FROM employee_positions AS employee_position
			JOIN employment_positions AS position ON position.id = employee_position.position_id AND position.deleted_at IS NULL
			WHERE employee_position.employee_id = employee.id AND employee_position.deleted_at IS NULL
		) AS position_values ON true
		LEFT JOIN employment_types AS employment_type ON employment_type.id = employee.employment_type_id
		LEFT JOIN branches AS branch ON branch.id = employee.branch_id
		WHERE true
		${visibilityClause}
		${searchClause}
		ORDER BY ${sortKey} ${direction} NULLS LAST, employee.id ASC
		OFFSET ${offset}
		LIMIT ${limit}
	`);
	return rows.map((row) => row.id);
}

async function lengthOfServiceSortedEmployeeIds(
	tx: Prisma.TransactionClient,
	search: string,
	visibility: EmployeeVisibility,
	sortOrder: 'asc' | 'desc',
	offset: number,
	limit: number,
	referenceDate: Date
): Promise<number[]> {
	const direction = sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
	const referenceDateIso = referenceDate.toISOString().slice(0, 10);
	const searchClause = employeeSqlSearchClause(search);
	const visibilityClause = employeeSqlVisibilityClause(visibility);
	const rows = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`
		SELECT employee.id
		FROM employees AS employee
		LEFT JOIN LATERAL (
			SELECT string_agg(department.name, '|' ORDER BY employee_department.is_primary DESC, department.sort_order, department.name, department.id) AS names
			FROM employee_departments AS employee_department
			JOIN employment_departments AS department ON department.id = employee_department.department_id AND department.deleted_at IS NULL
			WHERE employee_department.employee_id = employee.id AND employee_department.deleted_at IS NULL
		) AS department_values ON true
		LEFT JOIN employee_groups AS employee_group ON employee_group.id = employee.group_id
		LEFT JOIN LATERAL (
			SELECT string_agg(position.name, '|' ORDER BY employee_position.is_primary DESC, position.sort_order, position.name, position.id) AS names
			FROM employee_positions AS employee_position
			JOIN employment_positions AS position ON position.id = employee_position.position_id AND position.deleted_at IS NULL
			WHERE employee_position.employee_id = employee.id AND employee_position.deleted_at IS NULL
		) AS position_values ON true
		LEFT JOIN employment_types AS employment_type ON employment_type.id = employee.employment_type_id
		LEFT JOIN branches AS branch ON branch.id = employee.branch_id
		WHERE true
		${visibilityClause}
		${searchClause}
		ORDER BY GREATEST(
			0,
			EXTRACT(YEAR FROM age(LEAST(COALESCE(employee.retired_at, CAST(${referenceDateIso} AS date)), CAST(${referenceDateIso} AS date)), employee.hired_at)) * 12
			+ EXTRACT(MONTH FROM age(LEAST(COALESCE(employee.retired_at, CAST(${referenceDateIso} AS date)), CAST(${referenceDateIso} AS date)), employee.hired_at))
		) ${direction}, employee.id ASC
		OFFSET ${offset}
		LIMIT ${limit}
	`);
	return rows.map((row) => row.id);
}

async function employeeColumns() {
	const columns = await getPrisma().$queryRaw<DatabaseColumn[]>`
		SELECT
			attribute.attname AS "columnName",
			col_description(attribute.attrelid, attribute.attnum) AS "comment"
		FROM pg_attribute AS attribute
		WHERE attribute.attrelid = 'public.employees'::regclass
			AND attribute.attnum > 0
			AND NOT attribute.attisdropped
		ORDER BY attribute.attnum
	`;
	const databaseColumns = columns.flatMap((column) => {
		const key = employeeColumnKeys[column.columnName];
		return key ? [{ key, columnName: column.columnName, comment: column.comment }] : [];
	});
	return [...databaseColumns, { key: 'departmentNames', columnName: 'departments', comment: 'Departments' }, { key: 'positionNames', columnName: 'positions', comment: 'Positions' }];
}

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	const viewer = requireOperationApi(locals.user, permissionOperations.employeeRead);
	const query = parseListQuery(url, sortFields, 'employeeCode');
	const search = parseSearch(url);
	const visibleSearch = parseVisibleSearch(url, visibleSearchKeys);
	const withColumns = parseBooleanQuery(url, 'includeColumns', 'INVALID_INCLUDE_COLUMNS');
	if (withColumns) requireAdminApi(viewer);
	const referenceDate = employeeReferenceDate();
	const visibility = {
		includeRetired: parseBooleanQuery(url, 'includeRetired', 'INVALID_INCLUDE_RETIRED'),
		includeDeleted: parseBooleanQuery(url, 'includeDeleted', 'INVALID_INCLUDE_DELETED'),
		referenceDate
	};
	const where = employeeWhere(search, visibility);
	const { total, items } = await getPrisma().$transaction(async (tx) => {
		if (visibleSearch && search) return visibleEmployeePage(tx, search, visibleSearch.keys, visibleSearch.locale, visibility, query.sortBy, query.sortOrder, query.offset, query.limit);
		const total = await tx.employee.count({ where });
		if (!['roles', 'lengthOfService', 'department', 'position'].includes(query.sortBy)) {
			const items = await tx.employee.findMany({ where, select: employeeSafeSelect, orderBy: employeeOrderBy(query.sortBy, query.sortOrder), skip: query.offset, take: query.limit });
			return { total, items };
		}
		const ids = query.sortBy === 'roles'
			? await roleSortedEmployeeIds(tx, search, visibility, query.sortOrder, query.offset, query.limit)
			: query.sortBy === 'lengthOfService'
				? await lengthOfServiceSortedEmployeeIds(tx, search, visibility, query.sortOrder, query.offset, query.limit, referenceDate)
				: await assignmentSortedEmployeeIds(tx, search, visibility, query.sortBy as 'department' | 'position', query.sortOrder, query.offset, query.limit);
		const records = await tx.employee.findMany({ where: { id: { in: ids } }, select: employeeSafeSelect });
		const recordById = new Map(records.map((record) => [record.id, record]));
		return { total, items: ids.flatMap((id) => { const record = recordById.get(id); return record ? [record] : []; }) };
	}, { isolationLevel: 'RepeatableRead' });
	const columns = withColumns ? await employeeColumns() : undefined;
	return success(items.map((item) => employeeOutput(item, referenceDate)), 200, { ...listMeta(query, items.length, total), search, calculatedAsOf: referenceDate.toISOString().slice(0, 10), includeRetired: visibility.includeRetired, includeDeleted: visibility.includeDeleted, ...(columns ? { columns } : {}) });
}

export async function POST({ request, locals, url }: import('./$types').RequestEvent) {
	const actor = requireAdminApi(locals.user);
	if (hasPermissionOperation(actor, permissionOperations.systemManagement) && !dev && !allowsSensitiveRequest(url, request)) return failure(403, 'HTTPS_REQUIRED', 'Account invitations require HTTPS.');
	const parsed = parseEmployeeInput(await request.json().catch(() => null));
	if (!parsed.success) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', parsed.errors);
	const input = parsed.data;
	if (!await canAssignRequestedRoles(actor, input.roleIds)) return failure(403, 'ROLE_ASSIGNMENT_FORBIDDEN', 'You cannot assign one or more requested roles.');
	try {
		const result = await getPrisma().$transaction(async (tx) => {
			const referenceErrors = await employeeReferenceErrors(tx, { ...input.employee, departmentIds: input.departmentIds, primaryDepartmentId: input.primaryDepartmentId, positionIds: input.positionIds });
			if (referenceErrors.length) return { status: 'invalid_reference' as const, errors: referenceErrors };
			const created = await tx.employee.create({ data: input.employee, select: { id: true } });
			await syncEmployeeDepartments(tx, created.id, input.departmentIds, input.primaryDepartmentId);
			await syncEmployeePositions(tx, created.id, input.positionIds, input.primaryPositionId);
			if (!await createGlobalRoleGrants(tx, created.id, input.roleIds)) throw new Error('role unavailable');
			const invitation = hasPermissionOperation(actor, permissionOperations.systemManagement) ? await issueInvitation(tx, created.id, actor.id, input.employee.email) : null;
			await recordEmployeeChange(tx, created.id, actor.id, 'create', null, await readEmployeeFields(tx, created.id));
			await writeAuditLog(tx, actor.id, 'create', 'employee', created.id);
			await writeAuditLog(tx, actor.id, 'update_roles', 'employee', created.id);
			return { status: 'created' as const, item: await tx.employee.findUniqueOrThrow({ where: { id: created.id }, select: employeeSafeSelect }), invitation };
		}, { isolationLevel: 'Serializable' });
		if (result.status !== 'created') return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', result.errors);
		const response = success({ ...employeeOutput(result.item), ...(result.invitation ?? {}) }, 201);
		response.headers.set('Cache-Control', 'no-store');
		return response;
	} catch (error) {
		return employeeConflictResponse(error) ?? failure(400, 'INVALID_REQUEST', 'Invalid request.');
	}
}
