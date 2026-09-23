import { dev } from '$app/environment';
import { requireAdminApi, requireAuthenticatedApi, writeAuditLog } from '$lib/server/api/admin';
import { parseEmployeeInput } from '$lib/server/api/employee-input';
import { employeeConflictResponse } from '$lib/server/api/employee-errors';
import { employeeReferenceDate } from '$lib/server/api/employee-derived';
import { employeeOutput, employeeSafeSelect } from '$lib/server/api/employee-output';
import { employeeReferenceErrors } from '$lib/server/api/employee-references';
import { canAssignRequestedRoles, createGlobalRoleGrants } from '$lib/server/api/employee-roles';
import { issueInvitation } from '$lib/server/auth/invitation';
import { listMeta, parseListQuery } from '$lib/server/api/query';
import { failure, success, throwApiError } from '$lib/server/api/response';
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
	department_id: 'departmentId',
	group_id: 'groupId',
	position_id: 'positionId',
	employment_type_id: 'employmentTypeId',
	branch_id: 'branchId',
	retired_at: 'retiredAt',
	notes: 'notes',
	created_at: 'createdAt',
	updated_at: 'updatedAt',
	deleted_at: 'deletedAt'
};

type EmployeeSortField = (typeof sortFields)[number];
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

function includeColumnMetadata(url: URL) {
	const value = url.searchParams.get('includeColumns');
	if (value === null || value === 'false') return false;
	if (value === 'true') return true;
	throwApiError(422, 'INVALID_INCLUDE_COLUMNS', 'includeColumns must be true or false.', [
		{ field: 'includeColumns', reason: 'UNSUPPORTED_VALUE' }
	]);
}

function employeeWhere(search: string): Prisma.EmployeeWhereInput {
	if (!search) return { deletedAt: null };
	const contains = { contains: search, mode: 'insensitive' as const };
	return {
		deletedAt: null,
		OR: [
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
			{ departmentRef: { name: contains } },
			{ group: { name: contains } },
			{ position: { name: contains } },
			{ employmentType: { name: contains } },
			{ branch: { name: contains } }
		]
	};
}

function employeeOrderBy(sortBy: EmployeeSortField, sortOrder: 'asc' | 'desc'): Prisma.EmployeeOrderByWithRelationInput[] {
	switch (sortBy) {
		case 'employee': return [{ lastName: sortOrder }, { firstName: sortOrder }, { id: 'asc' }];
		case 'age': return [{ birthDate: sortOrder === 'asc' ? 'desc' : 'asc' }, { id: 'asc' }];
		case 'department': return [{ departmentRef: { name: sortOrder } }, { id: 'asc' }];
		case 'group': return [{ group: { name: sortOrder } }, { id: 'asc' }];
		case 'position': return [{ position: { name: sortOrder } }, { id: 'asc' }];
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
			OR department.name ILIKE ${pattern}
			OR employee_group.name ILIKE ${pattern}
			OR position.name ILIKE ${pattern}
			OR employment_type.name ILIKE ${pattern}
			OR branch.name ILIKE ${pattern}
		)
	`;
}

async function roleSortedEmployeeIds(
	tx: Prisma.TransactionClient,
	search: string,
	sortOrder: 'asc' | 'desc',
	offset: number,
	limit: number
): Promise<number[]> {
	const direction = sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
	const searchClause = employeeSqlSearchClause(search);
	const rows = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`
		SELECT employee.id
		FROM employees AS employee
		LEFT JOIN departments AS department ON department.id = employee.department_id
		LEFT JOIN employee_groups AS employee_group ON employee_group.id = employee.group_id
		LEFT JOIN positions AS position ON position.id = employee.position_id
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
		WHERE employee.deleted_at IS NULL
		${searchClause}
		ORDER BY role_values.sort_key ${direction}, employee.id ASC
		OFFSET ${offset}
		LIMIT ${limit}
	`);
	return rows.map((row) => row.id);
}

async function lengthOfServiceSortedEmployeeIds(
	tx: Prisma.TransactionClient,
	search: string,
	sortOrder: 'asc' | 'desc',
	offset: number,
	limit: number,
	referenceDate: Date
): Promise<number[]> {
	const direction = sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
	const referenceDateIso = referenceDate.toISOString().slice(0, 10);
	const searchClause = employeeSqlSearchClause(search);
	const rows = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`
		SELECT employee.id
		FROM employees AS employee
		LEFT JOIN departments AS department ON department.id = employee.department_id
		LEFT JOIN employee_groups AS employee_group ON employee_group.id = employee.group_id
		LEFT JOIN positions AS position ON position.id = employee.position_id
		LEFT JOIN employment_types AS employment_type ON employment_type.id = employee.employment_type_id
		LEFT JOIN branches AS branch ON branch.id = employee.branch_id
		WHERE employee.deleted_at IS NULL
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
	return columns.flatMap((column) => {
		const key = employeeColumnKeys[column.columnName];
		return key ? [{ key, columnName: column.columnName, comment: column.comment }] : [];
	});
}

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	const viewer = requireAuthenticatedApi(locals.user);
	const query = parseListQuery(url, sortFields, 'employeeCode');
	const search = parseSearch(url);
	const withColumns = includeColumnMetadata(url);
	if (withColumns) requireAdminApi(viewer);
	const where = employeeWhere(search);
	const referenceDate = employeeReferenceDate();
	const { total, items } = await getPrisma().$transaction(async (tx) => {
		const total = await tx.employee.count({ where });
		if (query.sortBy !== 'roles' && query.sortBy !== 'lengthOfService') {
			const items = await tx.employee.findMany({ where, select: employeeSafeSelect, orderBy: employeeOrderBy(query.sortBy, query.sortOrder), skip: query.offset, take: query.limit });
			return { total, items };
		}
		const ids = query.sortBy === 'roles'
			? await roleSortedEmployeeIds(tx, search, query.sortOrder, query.offset, query.limit)
			: await lengthOfServiceSortedEmployeeIds(tx, search, query.sortOrder, query.offset, query.limit, referenceDate);
		const records = await tx.employee.findMany({ where: { id: { in: ids }, deletedAt: null }, select: employeeSafeSelect });
		const recordById = new Map(records.map((record) => [record.id, record]));
		return { total, items: ids.flatMap((id) => { const record = recordById.get(id); return record ? [record] : []; }) };
	}, { isolationLevel: 'RepeatableRead' });
	const columns = withColumns ? await employeeColumns() : undefined;
	return success(items.map((item) => employeeOutput(item, referenceDate)), 200, { ...listMeta(query, items.length, total), search, calculatedAsOf: referenceDate.toISOString().slice(0, 10), ...(columns ? { columns } : {}) });
}

export async function POST({ request, locals, url }: import('./$types').RequestEvent) {
	const actor = requireAdminApi(locals.user);
	if (actor.roles.includes('system_administrator') && !dev && url.protocol !== 'https:') return failure(403, 'HTTPS_REQUIRED', 'Account invitations require HTTPS.');
	const parsed = parseEmployeeInput(await request.json().catch(() => null));
	if (!parsed.success) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', parsed.errors);
	const input = parsed.data;
	if (!canAssignRequestedRoles(actor, input.roleCodes)) return failure(403, 'ROLE_ASSIGNMENT_FORBIDDEN', 'You cannot assign one or more requested roles.');
	try {
		const result = await getPrisma().$transaction(async (tx) => {
			const referenceErrors = await employeeReferenceErrors(tx, input.employee);
			if (referenceErrors.length) return { status: 'invalid_reference' as const, errors: referenceErrors };
			const created = await tx.employee.create({ data: input.employee, select: { id: true } });
			if (!await createGlobalRoleGrants(tx, created.id, input.roleCodes)) throw new Error('role unavailable');
			const invitation = actor.roles.includes('system_administrator') ? await issueInvitation(tx, created.id, actor.id, input.employee.email) : null;
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
