import type { RequestHandler } from './$types';
import { requireScopedOperationApi, requiredBranchScope } from '$lib/server/api/branch-access';
import { employeeReferenceDate } from '$lib/server/api/employee-derived';
import { getPrisma } from '$lib/server/prisma';
import { success } from '$lib/server/api/response';

export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	const { actor, branchId: employeeBranch } = requireScopedOperationApi(locals.user, 'employees.read');
	const masterBranch = requiredBranchScope(actor, 'masters.read');
	const branchId = employeeBranch ?? masterBranch;
	const asOf = employeeReferenceDate();
	const data = await getPrisma().$transaction(async tx => {
		const employees = await tx.employee.findMany({
			where: { deletedAt: null, hiredAt: { lte: asOf }, OR: [{ retiredAt: null }, { retiredAt: { gt: asOf } }], ...(branchId === null ? {} : { branchId }) },
			select: { branchId: true, departmentAssignments: { where: { deletedAt: null, department: { deletedAt: null } }, select: { departmentId: true } } }
		});
		const branches = await tx.branch.findMany({ where: { deletedAt: null, ...(branchId === null ? {} : { id: branchId }) }, select: { id: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
		const departments = await tx.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
		const branchCounts = new Map<number, number>(), departmentCounts = new Map<number, number>();
		let unassigned = 0;
		for (const employee of employees) {
			branchCounts.set(employee.branchId, (branchCounts.get(employee.branchId) ?? 0) + 1);
			if (!employee.departmentAssignments.length) unassigned++;
			for (const id of new Set(employee.departmentAssignments.map(item => item.departmentId))) departmentCounts.set(id, (departmentCounts.get(id) ?? 0) + 1);
		}
		return { asOf: asOf.toISOString().slice(0, 10), scope: branchId === null ? 'global' : 'own_branch', branchId, total: employees.length,
			branches: branches.map(item => ({ ...item, count: branchCounts.get(item.id) ?? 0 })),
			departments: [...departments.map(item => ({ ...item, count: departmentCounts.get(item.id) ?? 0 })), { id: null, name: null, count: unassigned }] };
	}, { isolationLevel: 'RepeatableRead' });
	setHeaders({ 'cache-control': 'private, no-store' });
	return success(data);
};
