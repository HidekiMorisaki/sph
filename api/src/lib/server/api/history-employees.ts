import type { Prisma, PrismaClient } from '$lib/server/generated/prisma/client';

type HistoryItem = { changes: Prisma.JsonValue };
const employeeFields = new Set(['assigneeId', 'managerEmployeeId', 'deputyManagerEmployeeId']);
const object = (value: Prisma.JsonValue): value is Prisma.JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value);
const referenceId = (value: Prisma.JsonValue | undefined): number | null => {
	if (!value || !object(value)) return null;
	return typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0 ? value.id : null;
};

/** Stored references contain identity only. Names in legacy snapshots are never used for display. */
export async function resolveHistoryEmployees<T extends HistoryItem>(db: PrismaClient, items: T[], legacyBranchCodes = false): Promise<T[]> {
	const ids = new Set<number>();
	const codes = new Set<string>();
	for (const item of items) {
		if (!Array.isArray(item.changes)) continue;
		for (const change of item.changes) {
			if (!object(change) || typeof change.field !== 'string' || !employeeFields.has(change.field)) continue;
			for (const value of [change.before, change.after]) {
				const id = referenceId(value);
				if (id) ids.add(id);
				else if (legacyBranchCodes && typeof value === 'string' && value) codes.add(value);
			}
		}
	}
	if (!ids.size && !codes.size) return items;
	const employees = await db.employee.findMany({
		where: { deletedAt: null, OR: [{ id: { in: [...ids] } }, { employeeCode: { in: [...codes] } }] },
		select: { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true }
	});
	const byId = new Map(employees.map(({ employeeCode, ...employee }) => [employee.id, employee]));
	const byCode = new Map(employees.map(({ employeeCode, ...employee }) => [employeeCode, employee]));
	function resolve(value: Prisma.JsonValue | undefined): Prisma.JsonValue {
		const id = referenceId(value);
		if (id) return byId.get(id) ?? String(id);
		if (legacyBranchCodes && typeof value === 'string') return byCode.get(value) ?? value;
		return value ?? null;
	}
	return items.map(item => ({ ...item, changes: Array.isArray(item.changes) ? item.changes.map(change => {
		if (!object(change) || typeof change.field !== 'string' || !employeeFields.has(change.field)) return change;
		return { ...change, before: resolve(change.before), after: resolve(change.after) };
	}) : item.changes }));
}
