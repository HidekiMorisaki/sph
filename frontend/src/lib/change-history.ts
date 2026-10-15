import type { EmployeeNameParts } from '$lib/localization';

export type ChangeHistoryChange = {
	field: string;
	before: string | (EmployeeNameParts & { id?: number }) | null;
	after: string | (EmployeeNameParts & { id?: number }) | null;
};

export type ChangeHistoryEntry = {
	id: number;
	changedAt: string;
	actor: { id?: number; firstName: string; middleName: string | null; lastName: string };
	action: string;
	changes: ChangeHistoryChange[];
};
