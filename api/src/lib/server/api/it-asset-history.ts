import type { Prisma } from '$lib/server/generated/prisma/client';
import { ItAssetValidationError } from './it-asset-errors';
import { itAssetInclude } from './it-asset-input';
import { writeAuditLog } from './admin';

type FieldValue = { value: string | null; display: string | null };
export type AssetFields = Record<string, FieldValue>;
const field = (value: string | number | null | undefined, display?: string | null): FieldValue => ({
	value: value === null || value === undefined ? null : String(value),
	display: display === undefined ? value === null || value === undefined ? null : String(value) : display
});
const date = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

export async function readAssetFields(tx: Prisma.TransactionClient, assetId: number): Promise<AssetFields> {
	const asset = await tx.itAsset.findUniqueOrThrow({ where: { id: assetId }, include: itAssetInclude });
	const assignee = asset.assignments[0]?.employee;
	const storage = asset.storage;
	return {
		assetTag: field(asset.assetTag),
		typeId: field(asset.typeId, asset.type.name),
		manufacturerId: field(asset.manufacturerId, asset.manufacturer?.name ?? null),
		modelNumber: field(asset.modelNumber),
		serialNumber: field(asset.serialNumber),
		cpuTypeId: field(asset.cpuTypeId, asset.cpuType?.displayName ?? null),
		ramGb: field(asset.ramGb),
		operatingSystemId: field(asset.operatingSystemId, asset.operatingSystem?.displayName ?? null),
		loginUsername: field(asset.loginUsername),
		storageId: field(asset.storageId, `${storage.room.branch.name} / ${storage.room.name} / ${storage.name}`),
		statusId: field(asset.statusId, asset.status.name),
		purchasedOn: field(date(asset.purchasedOn)),
		disposalOn: field(date(asset.disposalOn)),
		notes: field(asset.notes),
		assigneeId: field(assignee?.id, assignee ? [assignee.firstName, assignee.middleName, assignee.lastName].filter(Boolean).join(' ') : null)
	};
}

export async function recordAssetChange(tx: Prisma.TransactionClient, assetId: number, actorId: number, action: 'create' | 'update' | 'delete' | 'assign' | 'return', before: AssetFields | null, after: AssetFields | null) {
	const keys = Object.keys(after ?? before ?? {});
	const changes = keys.flatMap(key => {
		const oldValue = before?.[key] ?? field(null);
		const newValue = after?.[key] ?? field(null);
		return oldValue.value === newValue.value ? [] : [{ field: key, before: oldValue.display, after: newValue.display }];
	});
	if (action === 'update' && changes.length === 0) return;
	const item = await tx.itAssetChangeHistory.create({ data: { assetId, actorId, action, changes } });
	await writeAuditLog(tx, actorId, 'record_change', 'it_asset_change_history', item.id);
}

export async function activeAssignee(tx: Prisma.TransactionClient, assetId: number) {
	return tx.itAssetAssignment.findFirst({
		where: { assetId, returnedAt: null, deletedAt: null },
		orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
		include: { employee: { select: { id: true, firstName: true, middleName: true, lastName: true } } }
	});
}

export async function changeAssignee(tx: Prisma.TransactionClient, assetId: number, assigneeId: number | null | undefined, actorId: number) {
	const current = await activeAssignee(tx, assetId);
	if (assigneeId === undefined || current?.employeeId === (assigneeId ?? undefined)) return current?.employee ?? null;
	let employee: { id: number; firstName: string; middleName: string | null; lastName: string } | null = null;
	if (assigneeId !== null) {
		employee = await tx.employee.findFirst({
			where: { id: assigneeId, deletedAt: null, OR: [{ retiredAt: null }, { retiredAt: { gt: new Date() } }] },
			select: { id: true, firstName: true, middleName: true, lastName: true }
		});
		if (!employee) throw new ItAssetValidationError([{ field: 'assigneeId', reason: 'Select an active employee.' }]);
	}
	if (current) {
		await tx.itAssetAssignment.update({ where: { id: current.id }, data: { returnedAt: new Date() } });
		await writeAuditLog(tx, actorId, 'return', 'it_asset_assignment', current.id);
	}
	if (employee) {
		const assignment = await tx.itAssetAssignment.create({ data: { assetId, employeeId: employee.id } });
		await writeAuditLog(tx, actorId, 'assign', 'it_asset_assignment', assignment.id);
	}
	return employee;
}
