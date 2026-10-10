import { requireOperationApi, requireSystemAdminApi, writeAuditLog } from '$lib/server/api/admin';
import { hasPermissionOperation, permissionOperations } from '$lib/server/auth/permissions';
import { duplicateField } from '$lib/server/api/database';
import { readMasterSnapshot, recordMasterChange } from '$lib/server/api/master-history';
import { parseRoleNameInput } from '$lib/server/api/role-input';
import { validateEditableRolePermissions } from '$lib/server/api/role-permissions';
import { listMeta, parseListQuery, parseSearch } from '$lib/server/api/query';
import { failure, success } from '$lib/server/api/response';
import type { Prisma } from '$lib/server/generated/prisma/client';
import { getPrisma } from '$lib/server/prisma';
import { roleOutput, roleSelect } from '$lib/server/api/role-output';

const sortFields = ['name', 'sortOrder'] as const;

export async function GET({ locals, url }: import('./$types').RequestEvent) {
	if (!locals.user || !hasPermissionOperation(locals.user, permissionOperations.systemManagement)) requireOperationApi(locals.user, permissionOperations.roleRead);
	const query = parseListQuery(url, sortFields, 'sortOrder');
	const search = parseSearch(url);
	const where: Prisma.RoleWhereInput = {
		deletedAt: null,
		...(search ? { name: { contains: search, mode: 'insensitive' } } : {})
	};
	const [total, items] = await getPrisma().$transaction([
		getPrisma().role.count({ where }),
		getPrisma().role.findMany({
			where,
			select: {
				...roleSelect,
				_count: { select: { grants: { where: { deletedAt: null, employee: { deletedAt: null } } } } }
			},
			orderBy: [{ [query.sortBy]: query.sortOrder }, ...(query.sortBy === 'sortOrder' ? [{ name: 'asc' as const }] : []), { id: 'asc' }],
			skip: query.offset,
			take: query.limit
		})
	]);
	const response = success(items.map(({ _count, ...role }) => ({ ...roleOutput(role), usageCount: _count.grants })), 200, listMeta(query, items.length, total));
	response.headers.set('Cache-Control', 'no-store');
	return response;
}

export async function POST({ locals, request }: import('./$types').RequestEvent) {
	const actor = requireSystemAdminApi(locals.user);
	const input: unknown = await request.json().catch(() => null);
	const parsed = parseRoleNameInput(input);
	if (!parsed.success) return failure(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', parsed.errors);
	const validated = validateEditableRolePermissions((input as Record<string, unknown>).permissionScopes);
	if (!validated.success) return failure(validated.status, validated.code, validated.message);
	try {
		const result = await getPrisma().$transaction(async (tx) => {
			const selected = await tx.permissionOperation.findMany({
				where: { operation: { in: validated.codes }, deletedAt: null, permission: { deletedAt: null } },
				select: { operation: true, permissionId: true }
			});
			if (selected.length !== validated.codes.length) return null;
			const role = await tx.role.create({ data: parsed.data });
			if (selected.length) await tx.rolePermission.createMany({ data: selected.map(({ operation, permissionId }) => ({ roleId: role.id, permissionId, scopeType: validated.grants.find(({ code }) => code === operation)!.scopeType })) });
			await writeAuditLog(tx, actor.id, 'create', 'role', role.id, { permissionScopes: validated.grants });
			await recordMasterChange(tx, 'role', role.id, actor.id, 'create', null, await readMasterSnapshot(tx, 'role', role.id));
			return await tx.role.findUniqueOrThrow({ where: { id: role.id }, select: roleSelect });
		});
		return result ? success(roleOutput(result), 201) : failure(400, 'INVALID_REQUEST', 'Unknown permission.');
	} catch (error) {
		return duplicateField(error)
			? failure(409, 'DUPLICATE_VALUE', 'A role with this name already exists.', [{ field: 'name', reason: 'DUPLICATE_VALUE' }])
			: failure(409, 'CREATE_CONFLICT', 'The role could not be created. Try again.');
	}
}
